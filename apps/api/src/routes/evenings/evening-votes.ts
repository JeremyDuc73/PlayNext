import type { FastifyInstance } from "fastify";
import {
  type EveningsRoutesOptions,
  requireUserId,
  currentVoteSchema,
  votesSchema,
} from "./helpers.js";
import type { VoteValue } from "../../evenings/types.js";
import {
  type EveningRow,
  loadEvening,
  isPresentParticipant,
  canOrganize,
  serializeEvening,
} from "../../evenings/model.js";
import { startVoting, revealEvening } from "../../evenings/lifecycle.js";
import { eveningBus } from "../../evenings/bus.js";
import { notifyGroupDiscord } from "../../discord/notify.js";

export function registerEveningVotesRoutes(
  app: FastifyInstance,
  opts: EveningsRoutesOptions,
) {
  const { db, config } = opts;

  app.post<{ Params: { eveningId: string } }>(
    "/evenings/:eveningId/start-voting",
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
      if (evening.status !== "selection") {
        return reply.code(400).send({ ok: false, error: "not_selection" });
      }

      const participants = await db.pool.query<{
        user_id: string;
        selection_submitted: boolean;
      }>(
        `
          SELECT user_id, selection_submitted
          FROM evening_participants
          WHERE evening_id = $1 AND present = true
        `,
        [evening.id],
      );
      if (
        participants.rows.length === 0 ||
        participants.rows.some((row) => !row.selection_submitted)
      ) {
        return reply.code(400).send({
          ok: false,
          error: "selection_incomplete",
          message: "Attends la sélection de tous les joueurs.",
        });
      }

      try {
        const started = await startVoting(db, evening);
        eveningBus.emitUpdate(evening.id, "start-voting");

        const candidateList = await db.pool.query<{ name: string }>(
          `
            SELECT name
            FROM evening_candidates
            WHERE evening_id = $1 AND round = $2
            ORDER BY sort_order ASC, name ASC
          `,
          [evening.id, started.round],
        );
        void notifyGroupDiscord(db, config, evening.group_id, {
          kind: "voting",
          playerCount: participants.rows.length,
          candidateCount: candidateList.rows.length,
          candidateNames: candidateList.rows.map((r) => r.name),
        }).catch((error) => {
          app.log.warn({ err: error, groupId: evening.group_id }, "discord_notify_failed");
        });

        return {
          ok: true,
          evening: await serializeEvening(db, started, userId),
        };
      } catch (error) {
        if (error instanceof Error && error.message === "selection_empty") {
          return reply.code(400).send({
            ok: false,
            error: "selection_empty",
            message: "Aucun jeu sélectionné.",
          });
        }
        throw error;
      }
    },
  );

  app.post<{ Params: { eveningId: string } }>(
    "/evenings/:eveningId/current-vote",
    async (request, reply) => {
      const userId = await requireUserId(db, request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }
      const evening = await loadEvening(db, request.params.eveningId);
      if (!evening) {
        return reply.code(404).send({ ok: false, error: "evening_not_found" });
      }
      if (evening.status !== "voting") {
        return reply.code(400).send({ ok: false, error: "not_voting" });
      }
      if (!(await isPresentParticipant(db, evening.id, userId))) {
        return reply.code(403).send({
          ok: false,
          error: "hors_tour",
          message: "Hors tour.",
        });
      }
      const parsed = currentVoteSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ ok: false, error: "invalid_body" });
      }

      const current = await db.pool.query<{
        id: string;
        launcher: string;
        external_id: string;
      }>(
        `
          SELECT id, launcher, external_id
          FROM evening_candidates
          WHERE evening_id = $1 AND round = $2
          ORDER BY sort_order ASC, name ASC
          OFFSET $3 LIMIT 1
        `,
        [evening.id, evening.round, evening.vote_cursor],
      );
      const candidate = current.rows[0];
      if (!candidate || candidate.id !== parsed.data.candidateId) {
        return reply.code(409).send({
          ok: false,
          error: "vote_cursor_changed",
          message: "Le jeu en cours a changé.",
        });
      }

      const participant = await db.pool.query<{ veto_available: boolean }>(
        `
          SELECT veto_available
          FROM evening_participants
          WHERE evening_id = $1 AND user_id = $2
        `,
        [evening.id, userId],
      );
      let vetoAvailable = participant.rows[0]?.veto_available ?? false;
      const existing = await db.pool.query<{
        candidate_id: string;
        value: VoteValue;
      }>(
        `
          SELECT candidate_id, value
          FROM evening_votes
          WHERE evening_id = $1 AND user_id = $2 AND round = $3
        `,
        [evening.id, userId, evening.round],
      );
      const nextVotes = new Map(
        existing.rows.map((row) => [row.candidate_id, row.value]),
      );
      nextVotes.set(candidate.id, parsed.data.value);
      const vetoCount = [...nextVotes.values()].filter(
        (value) => value === "veto",
      ).length;
      if (vetoCount > 1) {
        return reply.code(400).send({
          ok: false,
          error: "veto_limit",
          message: "Un seul veto par joueur et par soirée.",
        });
      }
      const hadVetoBefore = [...existing.rows].some(
        (row) => row.value === "veto",
      );
      if (
        parsed.data.value === "veto" &&
        !hadVetoBefore &&
        !vetoAvailable
      ) {
        return reply.code(400).send({
          ok: false,
          error: "veto_unavailable",
          message: "Ton veto a déjà été utilisé.",
        });
      }

      const client = await db.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `
            INSERT INTO evening_votes (
              evening_id, candidate_id, user_id, value, round
            )
            VALUES ($1,$2,$3,$4,$5)
            ON CONFLICT (candidate_id, user_id) DO UPDATE SET
              value = EXCLUDED.value,
              round = EXCLUDED.round,
              updated_at = now()
          `,
          [
            evening.id,
            candidate.id,
            userId,
            parsed.data.value,
            evening.round,
          ],
        );
        vetoAvailable =
          ![...nextVotes.values()].includes("veto") &&
          !(await client.query(
            `
              SELECT 1
              FROM evening_votes
              WHERE evening_id = $1 AND user_id = $2
                AND value = 'veto' AND round < $3
              LIMIT 1
            `,
            [evening.id, userId, evening.round],
          )).rowCount;
        await client.query(
          `
            UPDATE evening_participants
            SET veto_available = $3
            WHERE evening_id = $1 AND user_id = $2
          `,
          [evening.id, userId, vetoAvailable],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      const present = await db.pool.query<{ user_id: string }>(
        `
          SELECT user_id
          FROM evening_participants
          WHERE evening_id = $1 AND present = true
        `,
        [evening.id],
      );
      const currentVotes = await db.pool.query<{ user_id: string }>(
        `
          SELECT DISTINCT user_id
          FROM evening_votes
          WHERE evening_id = $1 AND candidate_id = $2 AND round = $3
        `,
        [evening.id, candidate.id, evening.round],
      );
      let next = (await loadEvening(db, evening.id))!;
      if (
        present.rows.length > 0 &&
        present.rows.every((row) =>
          currentVotes.rows.some((vote) => vote.user_id === row.user_id),
        )
      ) {
        const candidateCount = await db.pool.query<{ count: string }>(
          `
            SELECT COUNT(*)::text AS count
            FROM evening_candidates
            WHERE evening_id = $1 AND round = $2
          `,
          [evening.id, evening.round],
        );
        if (evening.vote_cursor + 1 >= Number(candidateCount.rows[0]?.count ?? 0)) {
          next = await revealEvening(db, next);
        } else {
          const updated = await db.pool.query<EveningRow>(
            `
              UPDATE evenings
              SET vote_cursor = vote_cursor + 1, updated_at = now()
              WHERE id = $1
              RETURNING *
            `,
            [evening.id],
          );
          next = updated.rows[0]!;
        }
      }

      eveningBus.emitUpdate(evening.id, "current-vote");
      return {
        ok: true,
        evening: await serializeEvening(db, next, userId),
      };
    },
  );

  app.post<{ Params: { eveningId: string } }>(
    "/evenings/:eveningId/votes",
    async (request, reply) => {
      const userId = await requireUserId(db, request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }

      const evening = await loadEvening(db, request.params.eveningId);
      if (!evening) {
        return reply.code(404).send({ ok: false, error: "evening_not_found" });
      }
      if (evening.status !== "voting") {
        return reply.code(400).send({ ok: false, error: "not_voting" });
      }
      if (!(await isPresentParticipant(db, evening.id, userId))) {
        return reply.code(403).send({
          ok: false,
          error: "hors_tour",
          message: "Hors tour.",
        });
      }

      const parsed = votesSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ ok: false, error: "invalid_body" });
      }

      const candidates = await db.pool.query<{ id: string }>(
        `
          SELECT id FROM evening_candidates
          WHERE evening_id = $1 AND round = $2 AND eliminated = false
        `,
        [evening.id, evening.round],
      );
      const allowed = new Set(candidates.rows.map((c) => c.id));
      for (const vote of parsed.data.votes) {
        if (!allowed.has(vote.candidateId)) {
          return reply.code(400).send({
            ok: false,
            error: "invalid_candidate",
          });
        }
      }

      const participant = await db.pool.query<{ veto_available: boolean }>(
        `
          SELECT veto_available
          FROM evening_participants
          WHERE evening_id = $1 AND user_id = $2
        `,
        [evening.id, userId],
      );
      let vetoAvailable = participant.rows[0]?.veto_available ?? false;

      const existing = await db.pool.query<{
        candidate_id: string;
        value: VoteValue;
      }>(
        `
          SELECT candidate_id, value
          FROM evening_votes
          WHERE evening_id = $1 AND user_id = $2 AND round = $3
        `,
        [evening.id, userId, evening.round],
      );
      const existingMap = new Map(
        existing.rows.map((row) => [row.candidate_id, row.value]),
      );

      // Simulate veto availability after applying batch
      const nextVotes = new Map(existingMap);
      for (const vote of parsed.data.votes) {
        nextVotes.set(vote.candidateId, vote.value);
      }
      const vetoCount = [...nextVotes.values()].filter((v) => v === "veto").length;
      if (vetoCount > 1) {
        return reply.code(400).send({
          ok: false,
          error: "veto_limit",
          message: "Un seul veto par joueur et par soirée.",
        });
      }

      // If adding a new veto and none available historically in this evening
      const hadVetoBefore = [...existingMap.values()].includes("veto");
      const hasVetoAfter = vetoCount > 0;
      if (hasVetoAfter && !hadVetoBefore && !vetoAvailable) {
        return reply.code(400).send({
          ok: false,
          error: "veto_unavailable",
          message: "Ton veto a déjà été utilisé.",
        });
      }

      const client = await db.pool.connect();
      try {
        await client.query("BEGIN");
        for (const vote of parsed.data.votes) {
          await client.query(
            `
              INSERT INTO evening_votes (evening_id, candidate_id, user_id, value, round)
              VALUES ($1, $2, $3, $4, $5)
              ON CONFLICT (candidate_id, user_id) DO UPDATE SET
                value = EXCLUDED.value,
                updated_at = now()
            `,
            [
              evening.id,
              vote.candidateId,
              userId,
              vote.value,
              evening.round,
            ],
          );
        }

        // Veto available = not currently using a veto this evening
        // (changing veto → other restores availability)
        vetoAvailable = !hasVetoAfter;
        // But if they used veto in a previous round, keep spent.
        const priorVeto = await client.query(
          `
            SELECT 1 FROM evening_votes
            WHERE evening_id = $1 AND user_id = $2 AND value = 'veto' AND round < $3
            LIMIT 1
          `,
          [evening.id, userId, evening.round],
        );
        if (priorVeto.rowCount && priorVeto.rowCount > 0) {
          vetoAvailable = false;
        }

        await client.query(
          `
            UPDATE evening_participants
            SET veto_available = $3
            WHERE evening_id = $1 AND user_id = $2
          `,
          [evening.id, userId, vetoAvailable],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      let current = (await loadEvening(db, evening.id))!;
      const snapshot = await serializeEvening(db, current, userId);
      if (snapshot.allVoted && current.status === "voting") {
        current = await revealEvening(db, current);
      }

      eveningBus.emitUpdate(evening.id, "votes");
      return {
        ok: true,
        evening: await serializeEvening(db, current, userId),
      };
    },
  );

  app.post<{ Params: { eveningId: string } }>(
    "/evenings/:eveningId/reveal",
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
      if (evening.status !== "voting") {
        return reply.code(400).send({ ok: false, error: "not_voting" });
      }
      const revealed = await revealEvening(db, evening);
      eveningBus.emitUpdate(evening.id, "reveal");
      return { ok: true, evening: await serializeEvening(db, revealed, userId) };
    },
  );
}
