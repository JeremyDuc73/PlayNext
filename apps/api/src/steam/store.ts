import type { Db } from "../db.js";
import { mergeGroupPlayable, normalizeGameTitle } from "../library/filter.js";

export type GroupPlayable = boolean | null;

type StoreApp = {
  success?: boolean;
  data?: {
    categories?: Array<{ description?: string }>;
  };
};

function cleanAppId(value: string): string {
  return value.replace(/[^\d]/g, "");
}

function hasGroupMode(labels: string[]): boolean {
  return labels.some((label) =>
    /multi-player|multiplayer|co-?op|mmo|pvp|shared\/split screen/i.test(
      label,
    ),
  );
}

function hasSinglePlayerMode(labels: string[]): boolean {
  return labels.some((label) => /single-player|singleplayer/i.test(label));
}

export function groupPlayableFromSteamCategories(
  labels: string[],
): GroupPlayable {
  const normalized = labels
    .map((label) => label.trim().toLowerCase())
    .filter(Boolean);
  if (hasGroupMode(normalized)) return true;
  if (hasSinglePlayerMode(normalized)) return false;
  return null;
}

/**
 * Steam Store fournit les modes de jeu sans clé.
 * Les AppIDs sont interrogés par petit pool ; le résultat sert aux groupes
 * et aux soirées. La bibliothèque personnelle reste complète.
 */
export async function fetchSteamGroupPlayable(
  appIds: string[],
): Promise<Map<string, GroupPlayable>> {
  const ids = [
    ...new Set(appIds.map(cleanAppId).filter((id) => id.length > 0)),
  ];
  const result = new Map<string, GroupPlayable>();
  if (ids.length === 0) return result;

  async function fetchOne(id: string): Promise<GroupPlayable | undefined> {
    try {
      const url = new URL(
        "https://store.steampowered.com/api/appdetails",
      );
      url.searchParams.set("appids", id);
      url.searchParams.set("l", "english");
      url.searchParams.set("cc", "US");

      const response = await fetch(url, {
        headers: { "User-Agent": "PlayNext/0.1" },
      });
      if (!response.ok) return undefined;

      const data = (await response.json()) as Record<string, StoreApp>;
      const app = data[id];
      if (!app?.success || !app.data?.categories) return undefined;
      const labels = (app.data.categories ?? [])
        .map((category) => category.description ?? "")
        .filter(Boolean);

      return groupPlayableFromSteamCategories(labels);
    } catch {
      // Un service catalogue indisponible ne doit pas bloquer une soirée.
      return undefined;
    }
  }

  // Steam limite/ralentit les appels : petit pool borné plutôt qu’un burst.
  for (let i = 0; i < ids.length; i += 4) {
    const batch = ids.slice(i, i + 4);
    const modes = await Promise.all(
      batch.map(async (id) => [id, await fetchOne(id)] as const),
    );
    for (const [id, mode] of modes) {
      if (mode !== undefined) result.set(id, mode);
    }
  }

  return result;
}

export async function persistMissingSteamGroupPlayable(
  db: Db,
  games: Array<{ externalId: string; name: string }>,
): Promise<number> {
  const unique = new Map<string, string>();
  for (const game of games) {
    const id = cleanAppId(game.externalId);
    if (id) unique.set(id, game.name);
  }
  if (unique.size === 0) return 0;

  const ids = [...unique.keys()];
  const known = await db.pool.query<{ external_id: string }>(
    `
      SELECT external_id
      FROM game_meta
      WHERE launcher = 'steam'
        AND external_id = ANY($1::text[])
        AND group_playable_source IS NOT NULL
    `,
    [ids],
  );
  const already = new Set(known.rows.map((row) => row.external_id));
  const missing = ids.filter((id) => !already.has(id));
  if (missing.length === 0) return 0;

  const modes = await fetchSteamGroupPlayable(missing);
  let written = 0;
  for (const [id, playable] of modes) {
    await db.pool.query(
      `
        INSERT INTO game_meta (
          launcher, external_id, name, group_playable,
          group_playable_source, fetched_at
        )
        VALUES ('steam', $1, $2, $3, 'steam_store', now())
        ON CONFLICT (launcher, external_id) DO UPDATE SET
          group_playable = EXCLUDED.group_playable,
          group_playable_source = EXCLUDED.group_playable_source,
          fetched_at = now()
      `,
      [id, unique.get(id) ?? id, playable],
    );
    written += 1;
  }
  return written;
}

export async function loadGroupPlayableByTitle(
  db: Db,
): Promise<Map<string, boolean>> {
  const result = await db.pool.query<{
    name: string;
    group_playable: boolean | null;
  }>(
    `
      SELECT name, group_playable
      FROM game_meta
      WHERE group_playable IS NOT NULL
    `,
  );
  const byTitle = new Map<string, boolean | null>();
  for (const row of result.rows) {
    const key = normalizeGameTitle(row.name);
    if (!key) continue;
    byTitle.set(
      key,
      mergeGroupPlayable(byTitle.get(key) ?? null, row.group_playable),
    );
  }
  const resolved = new Map<string, boolean>();
  for (const [key, value] of byTitle) {
    if (value != null) resolved.set(key, value);
  }
  return resolved;
}

type StoreSearch = {
  items?: Array<{ id?: number; name?: string; type?: string }>;
};

async function searchSteamAppId(name: string): Promise<string | null> {
  try {
    const url = new URL("https://store.steampowered.com/api/storesearch/");
    url.searchParams.set("term", name);
    url.searchParams.set("l", "english");
    url.searchParams.set("cc", "US");
    const response = await fetch(url, {
      headers: { "User-Agent": "PlayNext/0.1" },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as StoreSearch;
    const wanted = normalizeGameTitle(name);
    if (!wanted) return null;
    for (const item of data.items ?? []) {
      if (item.type && item.type !== "app") continue;
      if (!item.id) continue;
      if (normalizeGameTitle(item.name ?? "") === wanted) {
        return String(item.id);
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function persistMissingGroupPlayableBySteamTitle(
  db: Db,
  games: Array<{ launcher: string; externalId: string; name: string }>,
): Promise<number> {
  const unique = new Map<string, { launcher: string; externalId: string; name: string }>();
  for (const game of games) {
    if (game.launcher === "steam" || game.launcher === "riot") continue;
    const key = `${game.launcher}:${game.externalId}`;
    if (!unique.has(key)) unique.set(key, game);
  }
  if (unique.size === 0) return 0;

  const launchers = [...unique.values()].map((game) => game.launcher);
  const ids = [...unique.values()].map((game) => game.externalId);
  const known = await db.pool.query<{ launcher: string; external_id: string }>(
    `
      SELECT gm.launcher, gm.external_id
      FROM game_meta gm
      JOIN unnest($1::text[], $2::text[]) AS x(launcher, external_id)
        ON gm.launcher = x.launcher AND gm.external_id = x.external_id
      WHERE gm.group_playable_source IS NOT NULL
    `,
    [launchers, ids],
  );
  const already = new Set(
    known.rows.map((row) => `${row.launcher}:${row.external_id}`),
  );
  const missing = [...unique.values()]
    .filter((game) => !already.has(`${game.launcher}:${game.externalId}`))
    .slice(0, 16);
  if (missing.length === 0) return 0;

  let written = 0;
  for (const game of missing) {
    const appId = await searchSteamAppId(game.name);
    let playable: GroupPlayable = null;
    if (appId) {
      const modes = await fetchSteamGroupPlayable([appId]);
      playable = modes.get(appId) ?? null;
    }
    await db.pool.query(
      `
        INSERT INTO game_meta (
          launcher, external_id, name, group_playable,
          group_playable_source, fetched_at
        )
        VALUES ($1, $2, $3, $4, 'steam_store_search', now())
        ON CONFLICT (launcher, external_id) DO UPDATE SET
          group_playable = EXCLUDED.group_playable,
          group_playable_source = EXCLUDED.group_playable_source,
          fetched_at = now()
        WHERE game_meta.group_playable_source IS NULL
      `,
      [game.launcher, game.externalId, game.name, playable],
    );
    written += 1;
  }
  return written;
}

export async function persistMissingGroupPlayable(
  db: Db,
  games: Array<{ launcher: string; externalId: string; name: string }>,
): Promise<void> {
  await persistMissingSteamGroupPlayable(
    db,
    games.filter((game) => game.launcher === "steam"),
  );
  await persistMissingGroupPlayableBySteamTitle(db, games);
}
