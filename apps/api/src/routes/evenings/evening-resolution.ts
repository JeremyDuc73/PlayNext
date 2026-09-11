import type { FastifyInstance } from "fastify";
import {
  type EveningsRoutesOptions,
  requireUserId,
  closeSchema,
} from "./helpers.js";
import { getMembership } from "../../groups/membership.js";
import { isOwner } from "../../groups/roles.js";
import { notifyGroupDiscord } from "../../discord/notify.js";
import { steamLibraryPosterUrl, steamStoreUrl, riotCoverUrl } from "../../meta/covers.js";
import {
  fetchParticipantLibrary,
  fetchRecentWinnerKeys,
} from "../../evenings/library.js";
import { buildShortlist } from "../../evenings/shortlist.js";
import { candidatesForNewRound } from "../../evenings/scoring.js";
import {
  type EveningRow,
  loadEvening,
  canOrganize,
  isFinishedStatus,
  deleteFinishedEvening,
  insertCandidates,
  serializeEvening,
} from "../../evenings/model.js";
import { revealEvening } from "../../evenings/lifecycle.js";
import { eveningBus } from "../../evenings/bus.js";

export function registerEveningResolutionRoutes(
  app: FastifyInstance,
  opts: EveningsRoutesOptions,
) {
  const { db, config } = opts;

  app.post<{ Params: { eveningId: string } }>(
    "/evenings/:eveningId/close",
    async (request, reply) => {
      const userId = await requireUserId(db, request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }
      let evening = await loadEvening(db, request.params.eveningId);
      if (!evening) {
        return reply.code(404).send({ ok: false, error: "evening_not_found" });
      }
      if (!(await canOrganize(db, evening, userId))) {
        return reply.code(403).send({ ok: false, error: "forbidden" });
      }

      const parsed = closeSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ ok: false, error: "invalid_body" });
      }

      if (evening.status === "voting") {
        evening = await revealEvening(db, evening);
      }
      if (evening.status !== "revealed" && evening.status !== "closed") {
        return reply.code(400).send({ ok: false, error: "invalid_status" });
      }

      let winnerId = parsed.data.candidateId ?? evening.winner_candidate_id;
      const snapshot = await serializeEvening(db, evening, userId);
      const usedRoulette = Boolean(snapshot.resolution?.usedRoulette);
      if (winnerId) {
        const ok = await db.pool.query(
          `
            SELECT 1 FROM evening_candidates
            WHERE id = $1 AND evening_id = $2 AND round = $3
          `,
          [winnerId, evening.id, evening.round],
        );
        if (!ok.rowCount) {
          return reply.code(400).send({ ok: false, error: "invalid_winner" });
        }
      }

      const updated = await db.pool.query<EveningRow>(
        `
          UPDATE evenings
          SET status = 'closed',
              closed_at = now(),
              winner_candidate_id = $2,
              updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [evening.id, winnerId],
      );
      const closed = updated.rows[0]!;
      if (winnerId) {
        const winner = await db.pool.query<{
          name: string;
          launcher: string;
          external_id: string;
          cover_url: string | null;
        }>(
          `
            SELECT c.name, c.launcher, c.external_id, gm.cover_url
            FROM evening_candidates c
            LEFT JOIN game_meta gm
              ON gm.launcher = c.launcher
             AND gm.external_id = c.external_id
            WHERE c.id = $1
          `,
          [winnerId],
        );
        const row = winner.rows[0];
        if (row) {
          const coverUrl =
            row.cover_url ||
            (row.launcher === "steam"
              ? steamLibraryPosterUrl(row.external_id)
              : riotCoverUrl(row.launcher, row.external_id));

          const votesTally = await db.pool.query<{ hot: string; maybe: string }>(
            `
              SELECT COUNT(*) FILTER (WHERE value = 'hot')::text AS hot,
                     COUNT(*) FILTER (WHERE value = 'maybe')::text AS maybe
              FROM evening_votes
              WHERE evening_id = $1 AND candidate_id = $2 AND round = $3
            `,
            [closed.id, winnerId, closed.round],
          );
          const presentCount = await db.pool.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count FROM evening_participants WHERE evening_id = $1 AND present = true`,
            [closed.id],
          );

          void notifyGroupDiscord(db, config, closed.group_id, {
            kind: "chosen",
            gameName: row.name,
            coverUrl,
            scheduledAt: closed.scheduled_at,
            steamUrl: row.launcher === "steam" ? steamStoreUrl(row.external_id) : undefined,
            eveningKind: closed.kind,
            hotVotes: Number(votesTally.rows[0]?.hot ?? 0),
            maybeVotes: Number(votesTally.rows[0]?.maybe ?? 0),
            playerCount: Number(presentCount.rows[0]?.count ?? 0),
            usedRoulette,
          }).catch((error) => {
            app.log.warn(
              { err: error, groupId: closed.group_id },
              "discord_notify_failed",
            );
          });
        }
      }

      eveningBus.emitUpdate(evening.id, "close");
      return {
        ok: true,
        evening: await serializeEvening(db, closed, userId),
      };
    },
  );

  app.post<{ Params: { eveningId: string } }>(
    "/evenings/:eveningId/roulette",
    async (request, reply) => {
      const userId = await requireUserId(db, request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }
      const evening = await loadEvening(db, request.params.eveningId);
      if (!evening) {
        return reply.code(404).send({ ok: false, error: "evening_not_found" });
      }
      if (!(await canOrganize(db, evening, userId))) {
        return reply.code(403).send({ ok: false, error: "forbidden" });
      }
      if (evening.status !== "revealed") {
        return reply.code(400).send({ ok: false, error: "not_revealed" });
      }
      if (evening.kind === "direct") {
        return reply.code(400).send({ ok: false, error: "direct_evening" });
      }

      const snapshot = await serializeEvening(db, evening, userId);
      const tied = snapshot.resolution?.tiedIds ?? [];
      if (tied.length < 2) {
        return reply.code(400).send({ ok: false, error: "no_tie" });
      }
      const pick = tied[Math.floor(Math.random() * tied.length)]!;
      const updated = await db.pool.query<EveningRow>(
        `
          UPDATE evenings
          SET winner_candidate_id = $2, updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [evening.id, pick],
      );
      eveningBus.emitUpdate(evening.id, "roulette");
      return {
        ok: true,
        evening: await serializeEvening(db, updated.rows[0]!, userId),
      };
    },
  );

  app.post<{ Params: { eveningId: string } }>(
    "/evenings/:eveningId/revote-tie",
    async (request, reply) => {
      const userId = await requireUserId(db, request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }
      const evening = await loadEvening(db, request.params.eveningId);
      if (!evening) {
        return reply.code(404).send({ ok: false, error: "evening_not_found" });
      }
      if (!(await canOrganize(db, evening, userId))) {
        return reply.code(403).send({ ok: false, error: "forbidden" });
      }
      if (evening.status !== "revealed") {
        return reply.code(400).send({ ok: false, error: "not_revealed" });
      }
      if (evening.kind === "direct") {
        return reply.code(400).send({ ok: false, error: "direct_evening" });
      }

      const snapshot = await serializeEvening(db, evening, userId);
      const tiedIds = snapshot.resolution?.tiedIds ?? [];
      if (tiedIds.length < 2) {
        return reply.code(400).send({ ok: false, error: "no_tie" });
      }

      const tied = await db.pool.query<{
        launcher: string;
        external_id: string;
        name: string;
        owned_count: number;
        installed_count: number;
        participant_count: number;
        reasons: string[];
      }>(
        `
          SELECT launcher, external_id, name, owned_count,
                 installed_count, participant_count, reasons
          FROM evening_candidates
          WHERE evening_id = $1 AND round = $2 AND id = ANY($3::uuid[])
          ORDER BY sort_order ASC, name ASC
        `,
        [evening.id, evening.round, tiedIds],
      );
      const nextRound = evening.round + 1;
      const client = await db.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `
            UPDATE evenings
            SET status = 'voting',
                round = $2,
                vote_cursor = 0,
                revealed_at = NULL,
                winner_candidate_id = NULL,
                updated_at = now()
            WHERE id = $1
          `,
          [evening.id, nextRound],
        );
        for (const [index, candidate] of tied.rows.entries()) {
          await client.query(
            `
              INSERT INTO evening_candidates (
                evening_id, round, launcher, external_id, name, sort_order,
                owned_count, installed_count, participant_count, reasons
              )
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            `,
            [
              evening.id,
              nextRound,
              candidate.launcher,
              candidate.external_id,
              candidate.name,
              index,
              candidate.owned_count,
              candidate.installed_count,
              candidate.participant_count,
              candidate.reasons,
            ],
          );
        }
        await client.query(
          `
            UPDATE evening_participants
            SET selection_submitted = true
            WHERE evening_id = $1
          `,
          [evening.id],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      const updated = (await loadEvening(db, evening.id))!;
      eveningBus.emitUpdate(evening.id, "revote-tie");
      return {
        ok: true,
        evening: await serializeEvening(db, updated, userId),
      };
    },
  );

  app.post<{ Params: { eveningId: string } }>(
    "/evenings/:eveningId/new-round",
    async (request, reply) => {
      const userId = await requireUserId(db, request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }
      const evening = await loadEvening(db, request.params.eveningId);
      if (!evening) {
        return reply.code(404).send({ ok: false, error: "evening_not_found" });
      }
      if (!(await canOrganize(db, evening, userId))) {
        return reply.code(403).send({ ok: false, error: "forbidden" });
      }
      if (evening.status !== "revealed") {
        return reply.code(400).send({ ok: false, error: "not_revealed" });
      }
      if (evening.kind === "direct") {
        return reply.code(400).send({ ok: false, error: "direct_evening" });
      }

      const snapshot = await serializeEvening(db, evening, userId);
      const keepers = candidatesForNewRound(
        snapshot.candidates.map((c) => ({
          candidateId: c.id,
          launcher: c.launcher,
          externalId: c.externalId,
          tally: c.tally ?? {
            hot: 0,
            maybe: 0,
            pass: 0,
            veto: 0,
            score: 0,
            eliminated: Boolean(c.eliminated),
            eliminatedReason: c.eliminatedReason,
          },
        })),
      );

      const participants = await db.pool.query<{ user_id: string }>(
        `
          SELECT user_id FROM evening_participants
          WHERE evening_id = $1 AND present = true
        `,
        [evening.id],
      );
      const participantIds = participants.rows.map((p) => p.user_id);
      const library = await fetchParticipantLibrary(
        db,
        evening.group_id,
        participantIds,
      );
      const recent = await fetchRecentWinnerKeys(db, evening.group_id);

      const excludeKeys = new Set(
        snapshot.candidates
          .filter((c) => c.tally && (c.tally.veto > 0 || (c.tally.pass > 0 && c.tally.hot + c.tally.maybe === 0)))
          .map((c) => `${c.launcher}:${c.externalId}`),
      );
      // Prefer keepers; if empty, rebuild fresh excluding hard rejects
      const preferKeys = new Set(
        keepers.map((k) => `${k.launcher}:${k.externalId}`),
      );

      let pool = library;
      if (preferKeys.size > 0) {
        pool = library.filter((g) =>
          preferKeys.has(`${g.launcher}:${g.externalId}`),
        );
      }

      const poolSize = Math.max(1, pool.length);
      let shortlist = buildShortlist(pool, {
        requireOwned: false,
        requireInstalled: evening.require_installed,
        shortlistSize: poolSize,
        maxSize: poolSize,
        recentWinnerKeys: recent,
        excludeKeys,
      });

      if (shortlist.length < 3) {
        const librarySize = Math.max(1, library.length);
        shortlist = buildShortlist(library, {
          requireOwned: false,
          requireInstalled: false,
          shortlistSize: librarySize,
          maxSize: librarySize,
          recentWinnerKeys: recent,
          excludeKeys,
        });
      }

      if (shortlist.length === 0) {
        return reply.code(400).send({
          ok: false,
          error: "no_candidates",
          message: "Pas assez de jeux pour un nouveau tour.",
        });
      }

      const nextRound = evening.round + 1;
      await db.pool.query(
        `
          UPDATE evenings
          SET status = 'selection',
              round = $2,
              vote_cursor = 0,
              revealed_at = NULL,
              winner_candidate_id = NULL,
              updated_at = now()
          WHERE id = $1
        `,
        [evening.id, nextRound],
      );
      await db.pool.query(
        `
          UPDATE evening_participants
          SET selection_submitted = false,
              ready_at = NULL
          WHERE evening_id = $1
        `,
        [evening.id],
      );
      await insertCandidates(db, evening.id, nextRound, shortlist);

      const updated = (await loadEvening(db, evening.id))!;
      eveningBus.emitUpdate(evening.id, "new-round");
      return {
        ok: true,
        evening: await serializeEvening(db, updated, userId),
      };
    },
  );

  app.post<{ Params: { eveningId: string } }>(
    "/evenings/:eveningId/cancel",
    async (request, reply) => {
      const userId = await requireUserId(db, request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }
      const evening = await loadEvening(db, request.params.eveningId);
      if (!evening) {
        return reply.code(404).send({ ok: false, error: "evening_not_found" });
      }
      if (!(await canOrganize(db, evening, userId))) {
        return reply.code(403).send({ ok: false, error: "forbidden" });
      }
      if (evening.status === "cancelled") {
        return reply.code(400).send({
          ok: false,
          error: "already_cancelled",
          message: "Soirée déjà annulée.",
        });
      }

      const updated = await db.pool.query<EveningRow>(
        `
          UPDATE evenings
          SET status = 'cancelled', updated_at = now(), closed_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [evening.id],
      );
      eveningBus.emitUpdate(evening.id, "cancel");
      return {
        ok: true,
        evening: await serializeEvening(db, updated.rows[0]!, userId),
      };
    },
  );

  app.delete<{ Params: { eveningId: string } }>(
    "/evenings/:eveningId",
    async (request, reply) => {
      const userId = await requireUserId(db, request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }
      const evening = await loadEvening(db, request.params.eveningId);
      if (!evening) {
        return reply.code(404).send({ ok: false, error: "evening_not_found" });
      }
      const membership = await getMembership(db, evening.group_id, userId);
      if (!membership) {
        return reply.code(404).send({ ok: false, error: "evening_not_found" });
      }
      if (!isOwner(membership.role)) {
        return reply.code(403).send({
          ok: false,
          error: "forbidden",
          message: "Réservé au propriétaire.",
        });
      }
      if (!isFinishedStatus(evening.status)) {
        return reply.code(400).send({
          ok: false,
          error: "evening_in_progress",
          message: "Soirée encore en cours.",
        });
      }

      await deleteFinishedEvening(db, evening.id);
      eveningBus.emitUpdate(evening.id, "delete");
      return { ok: true };
    },
  );
}
