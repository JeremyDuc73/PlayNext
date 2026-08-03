import type { Db } from "../db.js";
import {
  groupPlayableOverride,
  isJunkGameName,
  launcherRank,
  normalizeGameTitle,
} from "../library/filter.js";
import type { LibraryGameAgg } from "./types.js";

/** Aggregate owned/installed games for a set of evening participants. */
export async function fetchParticipantLibrary(
  db: Db,
  groupId: string,
  participantIds: string[],
): Promise<LibraryGameAgg[]> {
  if (participantIds.length === 0) return [];

  const result = await db.pool.query<{
    user_id: string;
    launcher: string;
    external_id: string;
    name: string;
    installed: boolean;
      group_playable: boolean | null;
  }>(
    `
      SELECT
        ug.user_id,
        ug.launcher,
        ug.external_id,
        ug.name,
          ug.installed,
          gm.group_playable
      FROM user_games ug
        LEFT JOIN game_meta gm
          ON gm.launcher = ug.launcher
         AND gm.external_id = ug.external_id
      WHERE ug.user_id = ANY($1::uuid[])
        AND ug.owned = true
        AND ug.hidden = false
        AND NOT EXISTS (
          SELECT 1 FROM group_hidden_games h
          WHERE h.group_id = $2
            AND h.user_id = ug.user_id
            AND h.launcher = ug.launcher
            AND h.external_id = ug.external_id
        )
    `,
    [participantIds, groupId],
  );

  const participantCount = participantIds.length;

  type Acc = {
    launcher: string;
    externalId: string;
    name: string;
    owners: Map<string, boolean>; // userId -> installed
    groupPlayable: boolean | null;
  };

  function mergeGroupPlayable(
    current: boolean | null,
    next: boolean | null,
  ): boolean | null {
    if (current === true || next === true) return true;
    if (current === false || next === false) return false;
    return null;
  }

  const byTitle = new Map<string, Acc>();

  for (const row of result.rows) {
    if (isJunkGameName(row.name)) continue;
    const titleKey = normalizeGameTitle(row.name);
    if (!titleKey) continue;
    const rowGroupPlayable =
      groupPlayableOverride(row.name) ?? row.group_playable ?? null;

    const existing = byTitle.get(titleKey);
    if (!existing) {
      byTitle.set(titleKey, {
        launcher: row.launcher,
        externalId: row.external_id,
        name: row.name,
        owners: new Map([[row.user_id, row.installed]]),
        groupPlayable: rowGroupPlayable,
      });
      continue;
    }

    const prevInstalled = existing.owners.get(row.user_id) ?? false;
    existing.owners.set(row.user_id, prevInstalled || row.installed);
    existing.groupPlayable = mergeGroupPlayable(
      existing.groupPlayable,
      rowGroupPlayable,
    );

    if (launcherRank(row.launcher) < launcherRank(existing.launcher)) {
      existing.launcher = row.launcher;
      existing.externalId = row.external_id;
      existing.name = row.name;
    }
  }

  return [...byTitle.values()]
    .map((acc) => ({
      launcher: acc.launcher,
      externalId: acc.externalId,
      name: acc.name,
      ownedCount: acc.owners.size,
      installedCount: [...acc.owners.values()].filter(Boolean).length,
      participantCount,
      groupPlayable: groupPlayableOverride(acc.name) ?? acc.groupPlayable,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export async function fetchRecentWinnerKeys(
  db: Db,
  groupId: string,
  limit = 8,
): Promise<Set<string>> {
  const result = await db.pool.query<{
    launcher: string;
    external_id: string;
  }>(
    `
      SELECT c.launcher, c.external_id
      FROM evenings e
      JOIN evening_candidates c ON c.id = e.winner_candidate_id
      WHERE e.group_id = $1
        AND e.status = 'closed'
        AND e.winner_candidate_id IS NOT NULL
      ORDER BY e.closed_at DESC NULLS LAST, e.created_at DESC
      LIMIT $2
    `,
    [groupId, limit],
  );
  return new Set(
    result.rows.map((row) => `${row.launcher}:${row.external_id}`),
  );
}
