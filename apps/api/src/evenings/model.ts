import type { Db } from "../db.js";
import type { EveningStatus, VoteValue } from "./types.js";
import { toPublicUser } from "../auth/session.js";
import { getMembership } from "../groups/membership.js";
import { isManager } from "../groups/roles.js";
import { normalizeGameTitle } from "../library/filter.js";
import type { buildShortlist } from "./shortlist.js";
import { resolveWinner, talliesFromVotes } from "./scoring.js";

export type EveningRow = {
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
  vote_cursor: number;
  closes_at: Date | null;
  revealed_at: Date | null;
  closed_at: Date | null;
  winner_candidate_id: string | null;
  kind: "ritual" | "direct";
  scheduled_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export async function loadEvening(
  db: Db,
  eveningId: string,
): Promise<EveningRow | null> {
  const result = await db.pool.query<EveningRow>(
    `SELECT * FROM evenings WHERE id = $1`,
    [eveningId],
  );
  return result.rows[0] ?? null;
}

export async function isParticipant(
  db: Db,
  eveningId: string,
  userId: string,
): Promise<boolean> {
  const result = await db.pool.query(
    `SELECT 1 FROM evening_participants WHERE evening_id = $1 AND user_id = $2`,
    [eveningId, userId],
  );
  return Boolean(result.rowCount);
}

export async function isPresentParticipant(
  db: Db,
  eveningId: string,
  userId: string,
): Promise<boolean> {
  const result = await db.pool.query(
    `
      SELECT 1
      FROM evening_participants
      WHERE evening_id = $1 AND user_id = $2 AND present = true
    `,
    [eveningId, userId],
  );
  return Boolean(result.rowCount);
}

export async function canOrganize(
  db: Db,
  evening: EveningRow,
  userId: string,
): Promise<boolean> {
  if (evening.created_by === userId) return true;
  const membership = await getMembership(db, evening.group_id, userId);
  return Boolean(membership && isManager(membership.role));
}

export function isFinishedStatus(status: EveningStatus): boolean {
  return status === "closed" || status === "cancelled";
}

export async function deleteFinishedEvening(
  db: Db,
  eveningId: string,
): Promise<void> {
  await db.pool.query(
    `UPDATE evenings SET winner_candidate_id = NULL WHERE id = $1`,
    [eveningId],
  );
  await db.pool.query(`DELETE FROM evenings WHERE id = $1`, [eveningId]);
}

export async function fetchViewerOwnedKeys(
  db: Db,
  evening: EveningRow,
  userId: string,
): Promise<{ exact: Set<string>; titles: Set<string> }> {
  const result = await db.pool.query<{
    launcher: string;
    external_id: string;
    name: string;
  }>(
    `
      SELECT ug.launcher, ug.external_id, ug.name
      FROM user_games ug
      WHERE ug.user_id = $1
        AND ug.owned = true
        AND ug.hidden = false
        AND NOT EXISTS (
          SELECT 1
          FROM group_hidden_games h
          WHERE h.group_id = $2
            AND h.user_id = ug.user_id
            AND h.launcher = ug.launcher
            AND h.external_id = ug.external_id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM user_hidden_games uh
          WHERE uh.user_id = ug.user_id
            AND uh.launcher = ug.launcher
            AND uh.external_id = ug.external_id
        )
    `,
    [userId, evening.group_id],
  );
  return {
    exact: new Set(
      result.rows.map((row) => `${row.launcher}:${row.external_id}`),
    ),
    titles: new Set(
      result.rows
        .map((row) => normalizeGameTitle(row.name))
        .filter(Boolean),
    ),
  };
}

export function isOwnedByViewer(
  candidate: { launcher: string; external_id: string; name: string },
  owned: { exact: Set<string>; titles: Set<string> },
): boolean {
  return (
    owned.exact.has(`${candidate.launcher}:${candidate.external_id}`) ||
    owned.titles.has(normalizeGameTitle(candidate.name))
  );
}

export async function insertCandidates(
  db: Db,
  eveningId: string,
  round: number,
  shortlist: ReturnType<typeof buildShortlist>,
): Promise<void> {
  if (shortlist.length === 0) return;
  const params: unknown[] = [eveningId, round];
  const values = shortlist.map((game, index) => {
    const start = params.length + 1;
    params.push(
      game.launcher,
      game.externalId,
      game.name,
      index,
      game.ownedCount,
      game.installedCount,
      game.participantCount,
      game.reasons,
    );
    return `($1,$2,$${start},$${start + 1},$${start + 2},$${start + 3},$${start + 4},$${start + 5},$${start + 6},$${start + 7})`;
  });

  await db.pool.query(
    `
      INSERT INTO evening_candidates (
        evening_id, round, launcher, external_id, name, sort_order,
        owned_count, installed_count, participant_count, reasons
      )
      VALUES ${values.join(",")}
    `,
    params,
  );
}

export async function serializeEvening(
  db: Db,
  evening: EveningRow,
  viewerId: string,
) {
  const participants = await db.pool.query<{
    user_id: string;
    present: boolean;
    veto_available: boolean;
    selection_submitted: boolean;
    ready_at: Date | null;
    discord_id: string;
    username: string;
    global_name: string | null;
    avatar: string | null;
  }>(
    `
      SELECT p.user_id, p.present, p.veto_available,
             p.selection_submitted, p.ready_at,
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

  const mySelections = await db.pool.query<{ candidate_id: string }>(
    `
      SELECT candidate_id
      FROM evening_selections
      WHERE evening_id = $1 AND user_id = $2 AND round = $3
    `,
    [evening.id, viewerId, evening.round],
  );
  const viewerOwned = await fetchViewerOwnedKeys(db, evening, viewerId);

  const currentCandidate =
    evening.status === "voting"
      ? candidates.rows[evening.vote_cursor] ?? null
      : null;
  const currentVoteProgress = currentCandidate
    ? await db.pool.query<{ user_id: string }>(
        `
          SELECT DISTINCT user_id
          FROM evening_votes
          WHERE evening_id = $1
            AND candidate_id = $2
            AND round = $3
        `,
        [evening.id, currentCandidate.id, evening.round],
      )
    : { rows: [] };

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
  const allSelected =
    presentParticipants.length > 0 &&
    presentParticipants.every((p) => p.selection_submitted);
  const allReady =
    presentParticipants.length > 0 &&
    presentParticipants.every((p) => p.ready_at != null);
  const currentVotedUserIds = new Set(
    currentVoteProgress.rows.map((row) => row.user_id),
  );
  const allVoted =
    evening.status === "voting"
      ? presentParticipants.length > 0 &&
        presentParticipants.every((p) =>
          currentVoteProgress.rows.some((v) => v.user_id === p.user_id),
        )
      : evening.status === "revealed" || evening.status === "closed"
        ? true
        : false;
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
    selectionComplete: allSelected,
    lobbyComplete: allReady,
    selectionCount: mySelections.rows.length,
    mySelectionIds: mySelections.rows.map((row) => row.candidate_id),
    currentCandidateIndex:
      evening.status === "voting" ? evening.vote_cursor : null,
    currentCandidateId: currentCandidate?.id ?? null,
    currentVotes:
      evening.status === "voting" ? currentVoteProgress.rows.length : 0,
    currentVotesTotal: presentParticipants.length,
    closesAt: evening.closes_at,
    revealedAt: evening.revealed_at,
    closedAt: evening.closed_at,
    winnerCandidateId: evening.winner_candidate_id,
    kind: evening.kind === "direct" ? "direct" : "ritual",
    scheduledAt: evening.scheduled_at,
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
      selectionSubmitted: row.selection_submitted,
      ready: row.ready_at != null,
      readyAt: row.ready_at,
      hasVoted:
        evening.status === "lobby"
          ? row.ready_at != null
          : evening.status === "selection"
            ? row.selection_submitted
            : evening.status === "voting"
              ? currentVotedUserIds.has(row.user_id)
              : votedUserIds.includes(row.user_id),
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
      ownedByMe: isOwnedByViewer(row, viewerOwned),
      selectedByMe: mySelections.rows.some(
        (selection) => selection.candidate_id === row.id,
      ),
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
