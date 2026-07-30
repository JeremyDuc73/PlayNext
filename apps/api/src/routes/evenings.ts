import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { getSessionToken } from "../auth/request-session.js";
import { findUserBySessionToken, toPublicUser } from "../auth/session.js";
import type { Db } from "../db.js";
import {
  fetchParticipantLibrary,
  fetchRecentWinnerKeys,
} from "../evenings/library.js";
import {
  candidatesForNewRound,
  resolveWinner,
  talliesFromVotes,
} from "../evenings/scoring.js";
import { buildShortlist } from "../evenings/shortlist.js";
import type { EveningStatus, VoteValue } from "../evenings/types.js";
import { getMembership } from "../groups/membership.js";
import { isManager } from "../groups/roles.js";

type EveningsRoutesOptions = {
  db: Db;
};

const vibeSchema = z.enum([
  "chill",
  "competitive",
  "campaign",
  "party",
  "any",
]);

const createEveningSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  durationMinutes: z.number().int().min(15).max(600).optional().nullable(),
  vibe: vibeSchema.optional().nullable(),
  requireOwned: z.boolean().optional().default(true),
  requireInstalled: z.boolean().optional().default(false),
  shortlistSize: z.number().int().min(5).max(12).optional().default(8),
  participantIds: z.array(z.string().uuid()).min(1).max(32).optional(),
});

const votesSchema = z.object({
  votes: z
    .array(
      z.object({
        candidateId: z.string().uuid(),
        value: z.enum(["hot", "maybe", "pass", "veto"]),
      }),
    )
    .min(1)
    .max(20),
});

const closeSchema = z.object({
  candidateId: z.string().uuid().optional(),
});

type EveningRow = {
  id: string;
  group_id: string;
  created_by: string;
  status: EveningStatus;
  title: string | null;
  duration_minutes: number | null;
  vibe: string | null;
  require_owned: boolean;
  require_installed: boolean;
  shortlist_size: number;
  round: number;
  closes_at: Date | null;
  revealed_at: Date | null;
  closed_at: Date | null;
  winner_candidate_id: string | null;
  created_at: Date;
  updated_at: Date;
};

export const eveningsRoutes: FastifyPluginAsync<EveningsRoutesOptions> = async (
  app,
  opts,
) => {
  const { db } = opts;

  async function requireUserId(
    request: FastifyRequest,
  ): Promise<string | null> {
    const user = await findUserBySessionToken(db, getSessionToken(request));
    return user?.id ?? null;
  }

  async function loadEvening(eveningId: string): Promise<EveningRow | null> {
    const result = await db.pool.query<EveningRow>(
      `SELECT * FROM evenings WHERE id = $1`,
      [eveningId],
    );
    return result.rows[0] ?? null;
  }

  async function isParticipant(
    eveningId: string,
    userId: string,
  ): Promise<boolean> {
    const result = await db.pool.query(
      `SELECT 1 FROM evening_participants WHERE evening_id = $1 AND user_id = $2`,
      [eveningId, userId],
    );
    return Boolean(result.rowCount);
  }

  async function canOrganize(
    evening: EveningRow,
    userId: string,
  ): Promise<boolean> {
    if (evening.created_by === userId) return true;
    const membership = await getMembership(db, evening.group_id, userId);
    return Boolean(membership && isManager(membership.role));
  }

  async function insertCandidates(
    eveningId: string,
    round: number,
    shortlist: ReturnType<typeof buildShortlist>,
  ): Promise<void> {
    for (let i = 0; i < shortlist.length; i++) {
      const game = shortlist[i]!;
      await db.pool.query(
        `
          INSERT INTO evening_candidates (
            evening_id, round, launcher, external_id, name, sort_order,
            owned_count, installed_count, participant_count, reasons
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        `,
        [
          eveningId,
          round,
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
  }

  async function serializeEvening(evening: EveningRow, viewerId: string) {
    const participants = await db.pool.query<{
      user_id: string;
      present: boolean;
      veto_available: boolean;
      discord_id: string;
      username: string;
      global_name: string | null;
      avatar: string | null;
    }>(
      `
        SELECT p.user_id, p.present, p.veto_available,
               u.discord_id, u.username, u.global_name, u.avatar
        FROM evening_participants p
        JOIN users u ON u.id = p.user_id
        WHERE p.evening_id = $1
        ORDER BY COALESCE(u.global_name, u.username) ASC
      `,
      [evening.id],
    );

    const candidates = await db.pool.query<{
      id: string;
      round: number;
      launcher: string;
      external_id: string;
      name: string;
      sort_order: number;
      owned_count: number;
      installed_count: number;
      participant_count: number;
      reasons: string[];
      eliminated: boolean;
      eliminated_reason: string | null;
    }>(
      `
        SELECT *
        FROM evening_candidates
        WHERE evening_id = $1 AND round = $2
        ORDER BY sort_order ASC, name ASC
      `,
      [evening.id, evening.round],
    );

    const myVotes = await db.pool.query<{
      candidate_id: string;
      value: VoteValue;
    }>(
      `
        SELECT candidate_id, value
        FROM evening_votes
        WHERE evening_id = $1 AND user_id = $2 AND round = $3
      `,
      [evening.id, viewerId, evening.round],
    );

    const voteProgress = await db.pool.query<{
      user_id: string;
      vote_count: string;
    }>(
      `
        SELECT user_id, COUNT(*)::text AS vote_count
        FROM evening_votes
        WHERE evening_id = $1 AND round = $2
        GROUP BY user_id
      `,
      [evening.id, evening.round],
    );

    const candidateCount = candidates.rows.length;
    const votedUserIds = voteProgress.rows
      .filter((row) => Number(row.vote_count) >= candidateCount && candidateCount > 0)
      .map((row) => row.user_id);

    const presentParticipants = participants.rows.filter((p) => p.present);
    const allVoted =
      presentParticipants.length > 0 &&
      presentParticipants.every((p) => votedUserIds.includes(p.user_id));

    const revealed =
      evening.status === "revealed" ||
      evening.status === "closed";

    let tallies: Record<
      string,
      {
        hot: number;
        maybe: number;
        pass: number;
        veto: number;
        score: number;
        eliminated: boolean;
        eliminatedReason: string | null;
      }
    > | null = null;
    let resolution: {
      winnerId: string | null;
      tiedIds: string[];
      usedRoulette: boolean;
      allEliminated: boolean;
    } | null = null;

    if (revealed) {
      const allVotes = await db.pool.query<{
        candidate_id: string;
        value: VoteValue;
      }>(
        `
          SELECT candidate_id, value
          FROM evening_votes
          WHERE evening_id = $1 AND round = $2
        `,
        [evening.id, evening.round],
      );
      const map = talliesFromVotes(
        allVotes.rows.map((row) => ({
          candidateId: row.candidate_id,
          value: row.value,
        })),
      );
      tallies = {};
      for (const candidate of candidates.rows) {
        const tally = map.get(candidate.id) ?? {
          hot: 0,
          maybe: 0,
          pass: 0,
          veto: 0,
          score: 0,
          eliminated: candidate.eliminated,
          eliminatedReason: candidate.eliminated_reason,
        };
        if (candidate.eliminated) {
          tally.eliminated = true;
          tally.eliminatedReason =
            candidate.eliminated_reason ?? tally.eliminatedReason;
        }
        tallies[candidate.id] = tally;
      }
      resolution = resolveWinner(
        candidates.rows.map((c) => ({
          candidateId: c.id,
          tally: tallies![c.id]!,
          installedCount: c.installed_count,
          ownedCount: c.owned_count,
        })),
      );
    }

    const myParticipant = participants.rows.find((p) => p.user_id === viewerId);

    return {
      id: evening.id,
      groupId: evening.group_id,
      createdBy: evening.created_by,
      status: evening.status,
      title: evening.title,
      durationMinutes: evening.duration_minutes,
      vibe: evening.vibe,
      requireOwned: evening.require_owned,
      requireInstalled: evening.require_installed,
      shortlistSize: evening.shortlist_size,
      round: evening.round,
      closesAt: evening.closes_at,
      revealedAt: evening.revealed_at,
      closedAt: evening.closed_at,
      winnerCandidateId: evening.winner_candidate_id,
      createdAt: evening.created_at,
      updatedAt: evening.updated_at,
      allVoted,
      myVetoAvailable: myParticipant?.veto_available ?? false,
      participants: participants.rows.map((row) => ({
        ...toPublicUser({
          user_id: row.user_id,
          discord_id: row.discord_id,
          username: row.username,
          global_name: row.global_name,
          avatar: row.avatar,
        }),
        present: row.present,
        vetoAvailable: row.veto_available,
        hasVoted: votedUserIds.includes(row.user_id),
      })),
      candidates: candidates.rows.map((row) => ({
        id: row.id,
        round: row.round,
        launcher: row.launcher,
        externalId: row.external_id,
        name: row.name,
        ownedCount: row.owned_count,
        installedCount: row.installed_count,
        participantCount: row.participant_count,
        reasons: row.reasons ?? [],
        eliminated: revealed
          ? Boolean(tallies?.[row.id]?.eliminated || row.eliminated)
          : row.eliminated,
        eliminatedReason: revealed
          ? (tallies?.[row.id]?.eliminatedReason ?? row.eliminated_reason)
          : row.eliminated_reason,
        myVote: myVotes.rows.find((v) => v.candidate_id === row.id)?.value ?? null,
        tally: revealed ? (tallies?.[row.id] ?? null) : null,
      })),
      resolution: revealed
        ? {
            ...resolution!,
            winnerId: evening.winner_candidate_id ?? resolution!.winnerId,
          }
        : null,
    };
  }

  async function revealEvening(evening: EveningRow): Promise<EveningRow> {
    const candidates = await db.pool.query<{
      id: string;
      owned_count: number;
      installed_count: number;
    }>(
      `
        SELECT id, owned_count, installed_count
        FROM evening_candidates
        WHERE evening_id = $1 AND round = $2
      `,
      [evening.id, evening.round],
    );
    const votes = await db.pool.query<{
      candidate_id: string;
      value: VoteValue;
    }>(
      `
        SELECT candidate_id, value
        FROM evening_votes
        WHERE evening_id = $1 AND round = $2
      `,
      [evening.id, evening.round],
    );
    const tallies = talliesFromVotes(
      votes.rows.map((row) => ({
        candidateId: row.candidate_id,
        value: row.value,
      })),
    );

    for (const candidate of candidates.rows) {
      const tally = tallies.get(candidate.id);
      if (tally?.eliminated) {
        await db.pool.query(
          `
            UPDATE evening_candidates
            SET eliminated = true, eliminated_reason = $2
            WHERE id = $1
          `,
          [candidate.id, tally.eliminatedReason ?? "veto"],
        );
      }
    }

    const resolution = resolveWinner(
      candidates.rows.map((c) => ({
        candidateId: c.id,
        tally: tallies.get(c.id) ?? {
          hot: 0,
          maybe: 0,
          pass: 0,
          veto: 0,
          score: 0,
          eliminated: false,
          eliminatedReason: null,
        },
        installedCount: c.installed_count,
        ownedCount: c.owned_count,
      })),
    );

    const updated = await db.pool.query<EveningRow>(
      `
        UPDATE evenings
        SET status = 'revealed',
            revealed_at = COALESCE(revealed_at, now()),
            winner_candidate_id = $2,
            updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [evening.id, resolution.winnerId],
    );
    return updated.rows[0]!;
  }

  app.post<{ Params: { groupId: string } }>(
    "/groups/:groupId/evenings",
    async (request, reply) => {
      const userId = await requireUserId(request);
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

      const active = await db.pool.query<{ id: string }>(
        `
          SELECT id FROM evenings
          WHERE group_id = $1 AND status IN ('voting', 'revealed')
          LIMIT 1
        `,
        [request.params.groupId],
      );
      if (active.rowCount && active.rowCount > 0) {
        return reply.code(409).send({
          ok: false,
          error: "evening_already_open",
          message: "Une soirée est déjà en cours dans ce groupe.",
          eveningId: active.rows[0]!.id,
        });
      }

      const library = await fetchParticipantLibrary(
        db,
        request.params.groupId,
        participantIds,
      );
      const recent = await fetchRecentWinnerKeys(db, request.params.groupId);
      let shortlist = buildShortlist(library, {
        requireOwned: parsed.data.requireOwned,
        requireInstalled: parsed.data.requireInstalled,
        shortlistSize: parsed.data.shortlistSize,
        recentWinnerKeys: recent,
      });

      // Soft fallback: if requireInstalled yields nothing, retry without it.
      if (shortlist.length === 0 && parsed.data.requireInstalled) {
        shortlist = buildShortlist(library, {
          requireOwned: parsed.data.requireOwned,
          requireInstalled: false,
          shortlistSize: parsed.data.shortlistSize,
          recentWinnerKeys: recent,
        });
      }
      if (shortlist.length === 0 && parsed.data.requireOwned) {
        shortlist = buildShortlist(library, {
          requireOwned: false,
          requireInstalled: false,
          shortlistSize: parsed.data.shortlistSize,
          recentWinnerKeys: recent,
        });
      }
      if (shortlist.length === 0) {
        return reply.code(400).send({
          ok: false,
          error: "no_candidates",
          message:
            "Aucun jeu commun trouvé. Scannez vos bibliothèques ou assouplissez les contraintes.",
        });
      }

      const client = await db.pool.connect();
      try {
        await client.query("BEGIN");
        const inserted = await client.query<EveningRow>(
          `
            INSERT INTO evenings (
              group_id, created_by, status, title, duration_minutes, vibe,
              require_owned, require_installed, shortlist_size
            )
            VALUES ($1,$2,'voting',$3,$4,$5,$6,$7,$8)
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
        const full = await serializeEvening(evening, userId);
        return reply.code(201).send({ ok: true, evening: full });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  );

  app.get<{ Params: { groupId: string } }>(
    "/groups/:groupId/evenings",
    async (request, reply) => {
      const userId = await requireUserId(request);
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

      const result = await db.pool.query<EveningRow>(
        `
          SELECT *
          FROM evenings
          WHERE group_id = $1
          ORDER BY created_at DESC
          LIMIT 20
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
          createdAt: row.created_at,
          winnerCandidateId: row.winner_candidate_id,
        })),
      };
    },
  );

  app.get<{ Params: { eveningId: string } }>(
    "/evenings/:eveningId",
    async (request, reply) => {
      const userId = await requireUserId(request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }
      const evening = await loadEvening(request.params.eveningId);
      if (!evening) {
        return reply.code(404).send({ ok: false, error: "evening_not_found" });
      }
      if (!(await isParticipant(evening.id, userId))) {
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
        const revealed = await revealEvening(evening);
        return { ok: true, evening: await serializeEvening(revealed, userId) };
      }

      return {
        ok: true,
        evening: await serializeEvening(evening, userId),
      };
    },
  );

  app.post<{ Params: { eveningId: string } }>(
    "/evenings/:eveningId/votes",
    async (request, reply) => {
      const userId = await requireUserId(request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }

      const evening = await loadEvening(request.params.eveningId);
      if (!evening) {
        return reply.code(404).send({ ok: false, error: "evening_not_found" });
      }
      if (evening.status !== "voting") {
        return reply.code(400).send({ ok: false, error: "not_voting" });
      }
      if (!(await isParticipant(evening.id, userId))) {
        return reply.code(403).send({ ok: false, error: "forbidden" });
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

      let current = (await loadEvening(evening.id))!;
      const snapshot = await serializeEvening(current, userId);
      if (snapshot.allVoted && current.status === "voting") {
        current = await revealEvening(current);
      }

      return {
        ok: true,
        evening: await serializeEvening(current, userId),
      };
    },
  );

  app.post<{ Params: { eveningId: string } }>(
    "/evenings/:eveningId/reveal",
    async (request, reply) => {
      const userId = await requireUserId(request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }
      const evening = await loadEvening(request.params.eveningId);
      if (!evening) {
        return reply.code(404).send({ ok: false, error: "evening_not_found" });
      }
      if (!(await canOrganize(evening, userId))) {
        return reply.code(403).send({ ok: false, error: "forbidden" });
      }
      if (evening.status !== "voting") {
        return reply.code(400).send({ ok: false, error: "not_voting" });
      }
      const revealed = await revealEvening(evening);
      return { ok: true, evening: await serializeEvening(revealed, userId) };
    },
  );

  app.post<{ Params: { eveningId: string } }>(
    "/evenings/:eveningId/close",
    async (request, reply) => {
      const userId = await requireUserId(request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }
      let evening = await loadEvening(request.params.eveningId);
      if (!evening) {
        return reply.code(404).send({ ok: false, error: "evening_not_found" });
      }
      if (!(await canOrganize(evening, userId))) {
        return reply.code(403).send({ ok: false, error: "forbidden" });
      }

      const parsed = closeSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ ok: false, error: "invalid_body" });
      }

      if (evening.status === "voting") {
        evening = await revealEvening(evening);
      }
      if (evening.status !== "revealed" && evening.status !== "closed") {
        return reply.code(400).send({ ok: false, error: "invalid_status" });
      }

      let winnerId = parsed.data.candidateId ?? evening.winner_candidate_id;
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

      return {
        ok: true,
        evening: await serializeEvening(updated.rows[0]!, userId),
      };
    },
  );

  app.post<{ Params: { eveningId: string } }>(
    "/evenings/:eveningId/roulette",
    async (request, reply) => {
      const userId = await requireUserId(request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }
      const evening = await loadEvening(request.params.eveningId);
      if (!evening) {
        return reply.code(404).send({ ok: false, error: "evening_not_found" });
      }
      if (!(await canOrganize(evening, userId))) {
        return reply.code(403).send({ ok: false, error: "forbidden" });
      }
      if (evening.status !== "revealed") {
        return reply.code(400).send({ ok: false, error: "not_revealed" });
      }

      const snapshot = await serializeEvening(evening, userId);
      const tied =
        snapshot.resolution?.tiedIds?.length
          ? snapshot.resolution.tiedIds
          : snapshot.candidates
              .filter((c) => c.tally && !c.tally.eliminated)
              .sort((a, b) => (b.tally!.score ?? 0) - (a.tally!.score ?? 0))
              .slice(0, 3)
              .map((c) => c.id);

      if (tied.length === 0) {
        return reply.code(400).send({ ok: false, error: "no_pool" });
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
      return {
        ok: true,
        evening: await serializeEvening(updated.rows[0]!, userId),
      };
    },
  );

  app.post<{ Params: { eveningId: string } }>(
    "/evenings/:eveningId/new-round",
    async (request, reply) => {
      const userId = await requireUserId(request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }
      const evening = await loadEvening(request.params.eveningId);
      if (!evening) {
        return reply.code(404).send({ ok: false, error: "evening_not_found" });
      }
      if (!(await canOrganize(evening, userId))) {
        return reply.code(403).send({ ok: false, error: "forbidden" });
      }
      if (evening.status !== "revealed") {
        return reply.code(400).send({ ok: false, error: "not_revealed" });
      }

      const snapshot = await serializeEvening(evening, userId);
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
          .filter((c) => c.tally && (c.tally.veto > 0 || c.tally.pass > 0 && c.tally.hot + c.tally.maybe === 0))
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

      let shortlist = buildShortlist(pool, {
        requireOwned: evening.require_owned,
        requireInstalled: evening.require_installed,
        shortlistSize: evening.shortlist_size,
        recentWinnerKeys: recent,
        excludeKeys,
      });

      if (shortlist.length < 3) {
        shortlist = buildShortlist(library, {
          requireOwned: evening.require_owned,
          requireInstalled: false,
          shortlistSize: evening.shortlist_size,
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
          SET status = 'voting',
              round = $2,
              revealed_at = NULL,
              winner_candidate_id = NULL,
              updated_at = now()
          WHERE id = $1
        `,
        [evening.id, nextRound],
      );
      await insertCandidates(evening.id, nextRound, shortlist);

      const updated = (await loadEvening(evening.id))!;
      return {
        ok: true,
        evening: await serializeEvening(updated, userId),
      };
    },
  );

  app.post<{ Params: { eveningId: string } }>(
    "/evenings/:eveningId/cancel",
    async (request, reply) => {
      const userId = await requireUserId(request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }
      const evening = await loadEvening(request.params.eveningId);
      if (!evening) {
        return reply.code(404).send({ ok: false, error: "evening_not_found" });
      }
      if (!(await canOrganize(evening, userId))) {
        return reply.code(403).send({ ok: false, error: "forbidden" });
      }
      if (evening.status === "closed" || evening.status === "cancelled") {
        return reply.code(400).send({ ok: false, error: "already_finished" });
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
      return {
        ok: true,
        evening: await serializeEvening(updated.rows[0]!, userId),
      };
    },
  );
};
