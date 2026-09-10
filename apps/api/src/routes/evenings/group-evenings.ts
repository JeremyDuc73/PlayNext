import type { FastifyInstance } from "fastify";
import {
  type EveningsRoutesOptions,
  requireUserId,
  createEveningSchema,
} from "./helpers.js";
import { getMembership } from "../../groups/membership.js";
import { isOwner } from "../../groups/roles.js";
import { fetchSteamCatalogApp } from "../../steam/catalog.js";
import {
  fetchParticipantLibrary,
  fetchRecentWinnerKeys,
} from "../../evenings/library.js";
import { buildShortlist } from "../../evenings/shortlist.js";
import { isOnGroupCalendar } from "../../evenings/calendar.js";
import { normalizeGameTitle } from "../../library/filter.js";
import { notifyGroupDiscord } from "../../discord/notify.js";
import { defaultEveningScheduledAt } from "../../time/paris.js";
import { type EveningRow, serializeEvening } from "../../evenings/model.js";
import { eveningBus } from "../../evenings/bus.js";

export function registerGroupEveningsRoutes(
  app: FastifyInstance,
  opts: EveningsRoutesOptions,
) {
  const { db, config } = opts;

  app.post<{ Params: { groupId: string } }>(
    "/groups/:groupId/evenings",
    async (request, reply) => {
      const userId = await requireUserId(db, request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }

      const membership = await getMembership(
        db,
        request.params.groupId,
        userId,
      );
      if (!membership) {
        return reply.code(404).send({ ok: false, error: "group_not_found" });
      }

      const parsed = createEveningSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({
          ok: false,
          error: "invalid_body",
          details: parsed.error.flatten(),
        });
      }

      const members = await db.pool.query<{ user_id: string }>(
        `SELECT user_id FROM group_members WHERE group_id = $1`,
        [request.params.groupId],
      );
      const memberIds = new Set(members.rows.map((m) => m.user_id));
      const participantIds = [
        ...(parsed.data.participantIds ?? [...memberIds]),
      ];

      for (const id of participantIds) {
        if (!memberIds.has(id)) {
          return reply.code(400).send({
            ok: false,
            error: "invalid_participants",
            message: "Tous les participants doivent être membres du groupe.",
          });
        }
      }
      if (!participantIds.includes(userId)) {
        participantIds.push(userId);
      }

      const scheduledAt = parsed.data.scheduledAt
        ? new Date(parsed.data.scheduledAt)
        : defaultEveningScheduledAt();
      if (Number.isNaN(scheduledAt.getTime())) {
        return reply.code(400).send({
          ok: false,
          error: "invalid_schedule",
          message: "Horaire invalide.",
        });
      }

      const kind = parsed.data.kind;
      if (kind === "ritual") {
        const active = await db.pool.query<{ id: string }>(
          `
            SELECT id FROM evenings
            WHERE group_id = $1
              AND kind = 'ritual'
              AND status IN ('lobby', 'selection', 'voting', 'revealed')
            LIMIT 1
          `,
          [request.params.groupId],
        );
        if (active.rowCount && active.rowCount > 0) {
          return reply.code(409).send({
            ok: false,
            error: "evening_already_open",
            message: "Une soirée avec vote est déjà en cours dans ce groupe.",
            eveningId: active.rows[0]!.id,
          });
        }
      }

      if (kind === "direct") {
        if (!parsed.data.appId) {
          return reply.code(400).send({
            ok: false,
            error: "invalid_body",
            message: "Choisis un jeu Steam.",
          });
        }
        const lookup = await fetchSteamCatalogApp(parsed.data.appId);
        if (lookup.status === "retry") {
          return reply.code(503).send({
            ok: false,
            error: "steam_unavailable",
            message: "Store Steam injoignable.",
          });
        }
        if (lookup.status === "miss") {
          return reply.code(404).send({
            ok: false,
            error: "not_steam",
            message: "Jeu introuvable sur le Store.",
          });
        }
        const hit = lookup.hit;
        const library = await fetchParticipantLibrary(
          db,
          request.params.groupId,
          participantIds,
        );
        const agg =
          library.find(
            (game) =>
              game.launcher === "steam" && game.externalId === hit.appId,
          ) ??
          library.find(
            (game) =>
              normalizeGameTitle(game.name) === normalizeGameTitle(hit.name),
          );
        const client = await db.pool.connect();
        try {
          await client.query("BEGIN");
          const inserted = await client.query<EveningRow>(
            `
              INSERT INTO evenings (
                group_id, created_by, status, title, duration_minutes, vibe,
                require_owned, require_installed, shortlist_size, kind, scheduled_at
              )
              VALUES ($1,$2,'lobby',$3,NULL,NULL,false,false,1,'direct',$4)
              RETURNING *
            `,
            [
              request.params.groupId,
              userId,
              parsed.data.title ?? hit.name,
              scheduledAt,
            ],
          );
          const evening = inserted.rows[0]!;
          for (const pid of participantIds) {
            await client.query(
              `
                INSERT INTO evening_participants (evening_id, user_id)
                VALUES ($1, $2)
              `,
              [evening.id, pid],
            );
          }
          await client.query(
            `
              INSERT INTO evening_candidates (
                evening_id, round, launcher, external_id, name, sort_order,
                owned_count, installed_count, participant_count, reasons
              )
              VALUES ($1,1,'steam',$2,$3,0,$4,$5,$6,$7)
            `,
            [
              evening.id,
              hit.appId,
              hit.name,
              agg?.ownedCount ?? 0,
              agg?.installedCount ?? 0,
              participantIds.length,
              ["direct"],
            ],
          );
          await client.query("COMMIT");
          eveningBus.emitUpdate(evening.id, "created");
          const full = await serializeEvening(db, evening, userId);
          void notifyGroupDiscord(db, config, evening.group_id, {
            kind: "lobby",
            playerCount: participantIds.length,
            scheduledAt: evening.scheduled_at,
            gameName: hit.name,
            steamUrl: hit.steamUrl,
            coverUrl: hit.coverUrl,
            eveningKind: "direct",
            title: evening.title,
          }).catch((error) => {
            app.log.warn(
              { err: error, groupId: evening.group_id },
              "discord_notify_failed",
            );
          });
          return reply.code(201).send({ ok: true, evening: full });
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      }

      const library = await fetchParticipantLibrary(
        db,
        request.params.groupId,
        participantIds,
      );
      const recent = await fetchRecentWinnerKeys(db, request.params.groupId);
      const poolSize = Math.max(1, library.length);
      let shortlist = buildShortlist(library, {
        requireOwned: false,
        requireInstalled: parsed.data.requireInstalled,
        shortlistSize: poolSize,
        maxSize: poolSize,
        recentWinnerKeys: recent,
      });

      // Soft fallback: if requireInstalled yields nothing, retry without it.
      if (shortlist.length === 0 && parsed.data.requireInstalled) {
        shortlist = buildShortlist(library, {
          requireOwned: false,
          requireInstalled: false,
          shortlistSize: poolSize,
          maxSize: poolSize,
          recentWinnerKeys: recent,
        });
      }
      if (shortlist.length === 0) {
        return reply.code(400).send({
          ok: false,
          error: "no_candidates",
          message:
            "Aucun jeu compatible dans les bibliothèques du groupe.",
        });
      }

      const client = await db.pool.connect();
      try {
        await client.query("BEGIN");
        const inserted = await client.query<EveningRow>(
          `
            INSERT INTO evenings (
              group_id, created_by, status, title, duration_minutes, vibe,
              require_owned, require_installed, shortlist_size, kind, scheduled_at
            )
            VALUES ($1,$2,'lobby',$3,$4,$5,$6,$7,$8,'ritual',$9)
            RETURNING *
          `,
          [
            request.params.groupId,
            userId,
            parsed.data.title ?? null,
            parsed.data.durationMinutes ?? null,
            parsed.data.vibe ?? null,
            parsed.data.requireOwned,
            parsed.data.requireInstalled,
            parsed.data.shortlistSize,
            scheduledAt,
          ],
        );
        const evening = inserted.rows[0]!;

        for (const pid of participantIds) {
          await client.query(
            `
              INSERT INTO evening_participants (evening_id, user_id)
              VALUES ($1, $2)
            `,
            [evening.id, pid],
          );
        }

        for (let i = 0; i < shortlist.length; i++) {
          const game = shortlist[i]!;
          await client.query(
            `
              INSERT INTO evening_candidates (
                evening_id, round, launcher, external_id, name, sort_order,
                owned_count, installed_count, participant_count, reasons
              )
              VALUES ($1,1,$2,$3,$4,$5,$6,$7,$8,$9)
            `,
            [
              evening.id,
              game.launcher,
              game.externalId,
              game.name,
              i,
              game.ownedCount,
              game.installedCount,
              game.participantCount,
              game.reasons,
            ],
          );
        }

        await client.query("COMMIT");
        eveningBus.emitUpdate(evening.id, "created");
        const full = await serializeEvening(db, evening, userId);
        void notifyGroupDiscord(db, config, evening.group_id, {
          kind: "lobby",
          playerCount: participantIds.length,
          scheduledAt: evening.scheduled_at,
          eveningKind: "ritual",
          title: evening.title,
          vibe: evening.vibe,
          durationMinutes: evening.duration_minutes,
        }).catch((error) => {
          app.log.warn({ err: error, groupId: evening.group_id }, "discord_notify_failed");
        });
        return reply.code(201).send({ ok: true, evening: full });
      } catch (error) {
        await client.query("ROLLBACK");
        const code =
          error && typeof error === "object" && "code" in error
            ? String((error as { code?: string }).code)
            : "";
        if (code === "23505") {
          return reply.code(409).send({
            ok: false,
            error: "evening_already_open",
            message: "Une soirée avec vote est déjà en cours dans ce groupe.",
          });
        }
        throw error;
      } finally {
        client.release();
      }
    },
  );

  app.get<{ Params: { groupId: string } }>(
    "/groups/:groupId/evenings",
    async (request, reply) => {
      const userId = await requireUserId(db, request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }
      const membership = await getMembership(
        db,
        request.params.groupId,
        userId,
      );
      if (!membership) {
        return reply.code(404).send({ ok: false, error: "group_not_found" });
      }

      const result = await db.pool.query<
        EveningRow & { winner_name: string | null; game_name: string | null }
      >(
        `
          SELECT e.*, c.name AS winner_name, first.name AS game_name
          FROM evenings e
          LEFT JOIN evening_candidates c ON c.id = e.winner_candidate_id
          LEFT JOIN LATERAL (
            SELECT name
            FROM evening_candidates
            WHERE evening_id = e.id
            ORDER BY round ASC, sort_order ASC
            LIMIT 1
          ) first ON true
          WHERE e.group_id = $1
          ORDER BY
            CASE
              WHEN e.status IN ('lobby', 'selection', 'voting', 'revealed')
              THEN 0 ELSE 1
            END,
            e.scheduled_at ASC NULLS LAST,
            e.created_at DESC
          LIMIT 50
        `,
        [request.params.groupId],
      );

      return {
        ok: true,
        evenings: result.rows.map((row) => ({
          id: row.id,
          status: row.status,
          title: row.title,
          round: row.round,
          kind: row.kind === "direct" ? "direct" : "ritual",
          scheduledAt: row.scheduled_at,
          createdAt: row.created_at,
          winnerCandidateId: row.winner_candidate_id,
          winnerName: row.winner_name,
          gameName: row.game_name,
        })),
      };
    },
  );

  app.get<{ Params: { groupId: string } }>(
    "/groups/:groupId/calendar",
    async (request, reply) => {
      const userId = await requireUserId(db, request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }
      const membership = await getMembership(
        db,
        request.params.groupId,
        userId,
      );
      if (!membership) {
        return reply.code(404).send({ ok: false, error: "group_not_found" });
      }

      const result = await db.pool.query<
        EveningRow & { winner_name: string | null; game_name: string | null }
      >(
        `
          SELECT e.*, c.name AS winner_name, first.name AS game_name
          FROM evenings e
          LEFT JOIN evening_candidates c ON c.id = e.winner_candidate_id
          LEFT JOIN LATERAL (
            SELECT name
            FROM evening_candidates
            WHERE evening_id = e.id
            ORDER BY round ASC, sort_order ASC
            LIMIT 1
          ) first ON true
          WHERE e.group_id = $1
            AND e.status <> 'cancelled'
            AND (
              (
                e.kind = 'direct'
                AND e.status IN ('lobby', 'revealed', 'closed')
              )
              OR (
                COALESCE(e.kind, 'ritual') = 'ritual'
                AND e.status IN ('voting', 'revealed', 'closed')
              )
            )
          ORDER BY e.scheduled_at ASC NULLS LAST, e.created_at ASC
          LIMIT 300
        `,
        [request.params.groupId],
      );

      return {
        ok: true,
        evenings: result.rows
          .filter((row) =>
            isOnGroupCalendar({ kind: row.kind, status: row.status }),
          )
          .map((row) => ({
            id: row.id,
            status: row.status,
            title: row.title,
            round: row.round,
            kind: row.kind === "direct" ? "direct" : "ritual",
            scheduledAt: row.scheduled_at,
            createdAt: row.created_at,
            winnerCandidateId: row.winner_candidate_id,
            winnerName: row.winner_name,
            gameName: row.game_name,
          })),
      };
    },
  );

  app.delete<{ Params: { groupId: string } }>(
    "/groups/:groupId/evenings/history",
    async (request, reply) => {
      const userId = await requireUserId(db, request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }
      const membership = await getMembership(
        db,
        request.params.groupId,
        userId,
      );
      if (!membership) {
        return reply.code(404).send({ ok: false, error: "group_not_found" });
      }
      if (!isOwner(membership.role)) {
        return reply.code(403).send({
          ok: false,
          error: "forbidden",
          message: "Réservé au propriétaire.",
        });
      }

      const client = await db.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `
            UPDATE evenings
            SET winner_candidate_id = NULL
            WHERE group_id = $1
              AND status IN ('closed', 'cancelled')
          `,
          [request.params.groupId],
        );
        const deleted = await client.query(
          `
            DELETE FROM evenings
            WHERE group_id = $1
              AND status IN ('closed', 'cancelled')
            RETURNING id
          `,
          [request.params.groupId],
        );
        await client.query("COMMIT");
        return { ok: true, deleted: deleted.rowCount ?? 0 };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  );
}
