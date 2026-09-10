import type { PoolClient } from "pg";
import type { Db } from "../db.js";
import type { VoteValue } from "./types.js";
import { type EveningRow, loadEvening } from "./model.js";
import { lobbyCanAdvance, lobbyDropUserIds } from "./lobby.js";
import { resolveWinner, talliesFromVotes } from "./scoring.js";

export async function loadLobbyParticipants(
  eveningId: string,
  client: PoolClient,
) {
  const result = await client.query<{
    user_id: string;
    present: boolean;
    ready_at: Date | null;
  }>(
    `
      SELECT user_id, present, ready_at
      FROM evening_participants
      WHERE evening_id = $1
    `,
    [eveningId],
  );
  return result.rows.map((row) => ({
    userId: row.user_id,
    present: row.present,
    readyAt: row.ready_at,
  }));
}

export async function maybeAdvanceLobby(
  db: Db,
  evening: EveningRow,
): Promise<EveningRow> {
  if (evening.status !== "lobby") return evening;
  if (evening.kind === "direct") return evening;
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query<EveningRow>(
      `SELECT * FROM evenings WHERE id = $1 FOR UPDATE`,
      [evening.id],
    );
    const current = locked.rows[0];
    if (!current || current.status !== "lobby") {
      await client.query("COMMIT");
      return current ?? evening;
    }
    const participants = await loadLobbyParticipants(evening.id, client);
    if (!lobbyCanAdvance(participants)) {
      await client.query("COMMIT");
      return current;
    }
    const updated = await client.query<EveningRow>(
      `
        UPDATE evenings
        SET status = 'selection', updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [evening.id],
    );
    await client.query("COMMIT");
    return updated.rows[0]!;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function openSelectionDroppingUnready(
  db: Db,
  evening: EveningRow,
  organizerId: string,
): Promise<EveningRow> {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query<EveningRow>(
      `SELECT * FROM evenings WHERE id = $1 FOR UPDATE`,
      [evening.id],
    );
    const current = locked.rows[0];
    if (!current || current.status !== "lobby") {
      await client.query("COMMIT");
      return current ?? evening;
    }
    await client.query(
      `
        UPDATE evening_participants
        SET ready_at = COALESCE(ready_at, now())
        WHERE evening_id = $1 AND user_id = $2
      `,
      [evening.id, organizerId],
    );
    const participants = await loadLobbyParticipants(evening.id, client);
    const dropIds = lobbyDropUserIds(participants, organizerId);
    if (dropIds.length > 0) {
      await client.query(
        `
          UPDATE evening_participants
          SET present = false
          WHERE evening_id = $1 AND user_id = ANY($2::uuid[])
        `,
        [evening.id, dropIds],
      );
    }
    const remaining = await client.query<{ n: string }>(
      `
        SELECT COUNT(*)::text AS n
        FROM evening_participants
        WHERE evening_id = $1 AND present = true
      `,
      [evening.id],
    );
    if (Number(remaining.rows[0]?.n ?? 0) === 0) {
      await client.query("ROLLBACK");
      throw new Error("lobby_empty");
    }
    if (current.kind === "direct") {
      const candidate = await client.query<{ id: string }>(
        `
          SELECT id
          FROM evening_candidates
          WHERE evening_id = $1
          ORDER BY round ASC, sort_order ASC
          LIMIT 1
        `,
        [evening.id],
      );
      const updated = await client.query<EveningRow>(
        `
          UPDATE evenings
          SET status = 'revealed',
              revealed_at = COALESCE(revealed_at, now()),
              winner_candidate_id = $2,
              updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [evening.id, candidate.rows[0]?.id ?? null],
      );
      await client.query("COMMIT");
      return updated.rows[0]!;
    }
    const updated = await client.query<EveningRow>(
      `
        UPDATE evenings
        SET status = 'selection', updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [evening.id],
    );
    await client.query("COMMIT");
    return updated.rows[0]!;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function startVoting(
  db: Db,
  evening: EveningRow,
): Promise<EveningRow> {
  const selected = await db.pool.query<{
    id: string;
    selection_count: string;
    sort_order: number;
    name: string;
  }>(
    `
      SELECT c.id, COUNT(s.user_id)::text AS selection_count,
             c.sort_order, c.name
      FROM evening_candidates c
      JOIN evening_selections s
        ON s.candidate_id = c.id
       AND s.evening_id = c.evening_id
       AND s.round = c.round
      WHERE c.evening_id = $1 AND c.round = $2
      GROUP BY c.id, c.sort_order, c.name
      ORDER BY COUNT(s.user_id) DESC, c.sort_order ASC, c.name ASC
    `,
    [evening.id, evening.round],
  );
  if (selected.rows.length === 0) {
    throw new Error("selection_empty");
  }

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const selectedIds = selected.rows.map((row) => row.id);
    for (const [index, row] of selected.rows.entries()) {
      await client.query(
        `
          UPDATE evening_candidates
          SET sort_order = $3
          WHERE id = $1 AND evening_id = $2 AND round = $4
        `,
        [row.id, evening.id, index, evening.round],
      );
    }
    await client.query(
      `
        DELETE FROM evening_candidates
        WHERE evening_id = $1
          AND round = $2
          AND NOT (id = ANY($3::uuid[]))
      `,
      [evening.id, evening.round, selectedIds],
    );
    await client.query(
      `
        UPDATE evenings
        SET status = 'voting',
            vote_cursor = 0,
            updated_at = now()
        WHERE id = $1
      `,
      [evening.id],
    );
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

  return (await loadEvening(db, evening.id))!;
}

export async function revealEvening(
  db: Db,
  evening: EveningRow,
): Promise<EveningRow> {
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
