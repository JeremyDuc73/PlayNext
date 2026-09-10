import type { FastifyInstance } from "fastify";
import {
  type EveningsRoutesOptions,
  requireUserId,
  selectionSchema,
} from "./helpers.js";
import { getMembership } from "../../groups/membership.js";
import type { EveningStatus } from "../../evenings/types.js";
import {
  loadEvening,
  isParticipant,
  isPresentParticipant,
  canOrganize,
  fetchViewerOwnedKeys,
  isOwnedByViewer,
  serializeEvening,
} from "../../evenings/model.js";
import {
  maybeAdvanceLobby,
  openSelectionDroppingUnready,
  revealEvening,
} from "../../evenings/lifecycle.js";
import { eveningBus } from "../../evenings/bus.js";

export function registerEveningLobbyRoutes(
  app: FastifyInstance,
  opts: EveningsRoutesOptions,
) {
  const { db } = opts;

  app.get("/me/open-evenings", async (request, reply) => {
    const userId = await requireUserId(db, request);
    if (!userId) {
      return reply.code(401).send({ ok: false, error: "unauthenticated" });
    }

    const result = await db.pool.query<{
      id: string;
      group_id: string;
      group_name: string;
      status: EveningStatus;
      title: string | null;
      created_at: Date;
      kind: string;
      scheduled_at: Date | null;
    }>(
      `
        SELECT e.id, e.group_id, g.name AS group_name,
               e.status, e.title, e.created_at, e.kind, e.scheduled_at
        FROM evening_participants p
        JOIN evenings e ON e.id = p.evening_id
        JOIN groups g ON g.id = e.group_id
        WHERE p.user_id = $1
          AND e.status IN ('lobby', 'selection', 'voting', 'revealed')
        ORDER BY e.scheduled_at ASC NULLS LAST, e.created_at DESC
      `,
      [userId],
    );

    return {
      ok: true,
      evenings: result.rows.map((row) => ({
        id: row.id,
        groupId: row.group_id,
        groupName: row.group_name,
        status: row.status,
        title: row.title,
        kind: row.kind === "direct" ? "direct" : "ritual",
        scheduledAt: row.scheduled_at,
        createdAt: row.created_at,
      })),
    };
  });

  app.get<{ Params: { eveningId: string } }>(
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
      if (!(await isParticipant(db, evening.id, userId))) {
        const membership = await getMembership(db, evening.group_id, userId);
        if (!membership) {
          return reply.code(404).send({ ok: false, error: "evening_not_found" });
        }
      }

      // Auto-reveal if deadline passed
      if (
        evening.status === "voting" &&
        evening.closes_at &&
        evening.closes_at <= new Date()
      ) {
        const revealed = await revealEvening(db, evening);
        return { ok: true, evening: await serializeEvening(db, revealed, userId) };
      }

      const current =
        evening.status === "lobby" ? await maybeAdvanceLobby(db, evening) : evening;

      return {
        ok: true,
        evening: await serializeEvening(db, current, userId),
      };
    },
  );

  app.get<{ Params: { eveningId: string } }>(
    "/evenings/:eveningId/stream",
    async (request, reply) => {
      const userId = await requireUserId(db, request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }
      const evening = await loadEvening(db, request.params.eveningId);
      if (!evening) {
        return reply.code(404).send({ ok: false, error: "evening_not_found" });
      }
      if (!(await isParticipant(db, evening.id, userId))) {
        const membership = await getMembership(db, evening.group_id, userId);
        if (!membership) {
          return reply.code(404).send({ ok: false, error: "evening_not_found" });
        }
      }

      reply.hijack();
      const headers = reply.getHeaders();
      for (const [k, v] of Object.entries(headers)) {
        if (v !== undefined) reply.raw.setHeader(k, v);
      }
      reply.raw.setHeader("Content-Type", "text/event-stream");
      reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.setHeader("X-Accel-Buffering", "no");
      reply.raw.flushHeaders();

      const send = (event: string, data: unknown) => {
        try {
          reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        } catch {
          // Socket closed
        }
      };

      try {
        const initial = await serializeEvening(db, evening, userId);
        send("sync", initial);
      } catch (err) {
        app.log.warn({ err, eveningId: evening.id }, "sse_initial_sync_failed");
      }

      const keepalive = setInterval(() => {
        try {
          reply.raw.write(": ping\n\n");
        } catch {
          // Socket closed
        }
      }, 15000);

      const unsubscribe = eveningBus.onUpdate(evening.id, async () => {
        try {
          const latest = await loadEvening(db, evening.id);
          if (!latest) {
            send("deleted", { eveningId: evening.id });
            return;
          }
          const serialized = await serializeEvening(db, latest, userId);
          send("sync", serialized);
        } catch (err) {
          app.log.warn({ err, eveningId: evening.id }, "sse_update_sync_failed");
        }
      });

      request.raw.on("close", () => {
        clearInterval(keepalive);
        unsubscribe();
      });
    },
  );

  app.post<{ Params: { eveningId: string } }>(
    "/evenings/:eveningId/ready",
    async (request, reply) => {
      const userId = await requireUserId(db, request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }
      const evening = await loadEvening(db, request.params.eveningId);
      if (!evening) {
        return reply.code(404).send({ ok: false, error: "evening_not_found" });
      }
      if (
        evening.status === "selection" ||
        evening.status === "voting" ||
        evening.status === "revealed"
      ) {
        return {
          ok: true,
          evening: await serializeEvening(db, evening, userId),
        };
      }
      if (evening.status !== "lobby") {
        return reply.code(400).send({ ok: false, error: "not_lobby" });
      }
      if (!(await isPresentParticipant(db, evening.id, userId))) {
        return reply.code(403).send({
          ok: false,
          error: "hors_tour",
          message: "Hors tour.",
        });
      }

      await db.pool.query(
        `
          UPDATE evening_participants
          SET ready_at = COALESCE(ready_at, now())
          WHERE evening_id = $1 AND user_id = $2
        `,
        [evening.id, userId],
      );
      const advanced = await maybeAdvanceLobby(db, evening);
      eveningBus.emitUpdate(evening.id, "ready");
      return {
        ok: true,
        evening: await serializeEvening(db, advanced, userId),
      };
    },
  );

  app.post<{ Params: { eveningId: string } }>(
    "/evenings/:eveningId/open-selection",
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
      if (
        evening.status === "selection" ||
        evening.status === "voting" ||
        evening.status === "revealed"
      ) {
        return {
          ok: true,
          evening: await serializeEvening(db, evening, userId),
        };
      }
      if (evening.status !== "lobby") {
        return reply.code(400).send({ ok: false, error: "not_lobby" });
      }

      try {
        const opened = await openSelectionDroppingUnready(db, evening, userId);
        eveningBus.emitUpdate(evening.id, "open-selection");
        return {
          ok: true,
          evening: await serializeEvening(db, opened, userId),
        };
      } catch (error) {
        if (error instanceof Error && error.message === "lobby_empty") {
          return reply.code(400).send({
            ok: false,
            error: "lobby_empty",
            message: "Personne n’est prêt.",
          });
        }
        throw error;
      }
    },
  );

  app.post<{ Params: { eveningId: string } }>(
    "/evenings/:eveningId/selections",
    async (request, reply) => {
      const userId = await requireUserId(db, request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }
      const evening = await loadEvening(db, request.params.eveningId);
      if (!evening) {
        return reply.code(404).send({ ok: false, error: "evening_not_found" });
      }
      if (evening.status !== "selection") {
        return reply.code(400).send({ ok: false, error: "not_selection" });
      }
      if (!(await isPresentParticipant(db, evening.id, userId))) {
        return reply.code(403).send({
          ok: false,
          error: "hors_tour",
          message: "Hors tour.",
        });
      }

      const parsed = selectionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ ok: false, error: "invalid_body" });
      }
      const candidateIds = [...new Set(parsed.data.candidateIds)];
      if (candidateIds.length > evening.shortlist_size) {
        return reply.code(400).send({
          ok: false,
          error: "selection_limit",
          message: `Choisis au maximum ${evening.shortlist_size} jeux.`,
        });
      }

      const candidates = await db.pool.query<{
        id: string;
        launcher: string;
        external_id: string;
        name: string;
      }>(
        `
          SELECT id, launcher, external_id, name
          FROM evening_candidates
          WHERE evening_id = $1 AND round = $2 AND eliminated = false
        `,
        [evening.id, evening.round],
      );
      const allowed = new Set(candidates.rows.map((row) => row.id));
      if (candidateIds.some((id) => !allowed.has(id))) {
        return reply.code(400).send({
          ok: false,
          error: "invalid_candidate",
        });
      }
      const viewerOwned = await fetchViewerOwnedKeys(db, evening, userId);
      const selectedRows = candidates.rows.filter((row) =>
        candidateIds.includes(row.id),
      );
      if (selectedRows.some((row) => !isOwnedByViewer(row, viewerOwned))) {
        return reply.code(403).send({
          ok: false,
          error: "candidate_not_owned",
          message: "Tu peux sélectionner uniquement tes jeux.",
        });
      }

      const client = await db.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `
            DELETE FROM evening_selections
            WHERE evening_id = $1 AND user_id = $2 AND round = $3
          `,
          [evening.id, userId, evening.round],
        );
        for (const candidateId of candidateIds) {
          await client.query(
            `
              INSERT INTO evening_selections (
                evening_id, candidate_id, user_id, round
              )
              VALUES ($1,$2,$3,$4)
            `,
            [evening.id, candidateId, userId, evening.round],
          );
        }
        await client.query(
          `
            UPDATE evening_participants
            SET selection_submitted = true
            WHERE evening_id = $1 AND user_id = $2
          `,
          [evening.id, userId],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      eveningBus.emitUpdate(evening.id, "selections");
      return {
        ok: true,
        evening: await serializeEvening(
          db,
          (await loadEvening(db, evening.id))!,
          userId,
        ),
      };
    },
  );
}
