import type { Db } from "../db.js";
import { mergeGroupPlayable, normalizeGameTitle } from "../library/filter.js";

export type GroupPlayable = boolean | null;

/** Un run classe peu de titres : Steam 429 si on burst. Le suivant reprend. */
const STEAM_DETAILS_PER_RUN = 8;
const STEAM_SEARCH_PER_RUN = 5;
const STEAM_GAP_MS = 1100;
const STEAM_RETRY_STOP = 3;

type StoreApp = {
  success?: boolean;
  data?: {
    categories?: Array<{ description?: string }>;
  };
};

type StoreSearch = {
  items?: Array<{ id?: number; name?: string; type?: string }>;
};

export type SteamDetailsLookup =
  | { status: "classified"; playable: GroupPlayable }
  | { status: "retry"; httpStatus?: number };

export type SteamSearchLookup =
  | { status: "retry" }
  | { status: "miss" }
  | { status: "match"; appId: string };

export type SteamTitleSearchWrite =
  | { write: false }
  | { write: true; playable: GroupPlayable; source: "steam_store_search" | "steam_store_search_miss" };

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

export function shouldStopSteamEnrichment(input: {
  consecutiveRetries: number;
  httpStatus?: number;
}): boolean {
  if (input.httpStatus === 429 || input.httpStatus === 403) return true;
  return input.consecutiveRetries >= STEAM_RETRY_STOP;
}

/** Ne grave un inconnu que sur une recherche Store aboutie, jamais sur un 429. */
export function steamTitleSearchWrite(
  lookup: SteamSearchLookup,
  details: SteamDetailsLookup | null,
): SteamTitleSearchWrite {
  if (lookup.status === "retry") return { write: false };
  if (lookup.status === "miss") {
    return {
      write: true,
      playable: null,
      source: "steam_store_search_miss",
    };
  }
  if (!details || details.status === "retry") return { write: false };
  return {
    write: true,
    playable: details.playable,
    source: "steam_store_search",
  };
}

function wait(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchSteamAppDetails(id: string): Promise<SteamDetailsLookup> {
  try {
    const url = new URL("https://store.steampowered.com/api/appdetails");
    url.searchParams.set("appids", id);
    url.searchParams.set("l", "english");
    url.searchParams.set("cc", "US");

    const response = await fetch(url, {
      headers: { "User-Agent": "PlayNext/0.1" },
    });
    if (!response.ok) {
      return { status: "retry", httpStatus: response.status };
    }

    const data = (await response.json()) as Record<string, StoreApp>;
    const app = data[id];
    // Steam renvoie souvent 200 + success:false quand il rate-limit.
    if (!app?.success) return { status: "retry", httpStatus: 200 };

    const labels = (app.data?.categories ?? [])
      .map((category) => category.description ?? "")
      .filter(Boolean);
    return {
      status: "classified",
      playable: groupPlayableFromSteamCategories(labels),
    };
  } catch {
    return { status: "retry" };
  }
}

/**
 * Steam Store fournit les modes de jeu sans clé.
 * Un AppID à la fois, avec pause : un burst déclenche un 429 silencieux.
 */
export async function fetchSteamGroupPlayable(
  appIds: string[],
): Promise<Map<string, GroupPlayable>> {
  const ids = [
    ...new Set(appIds.map(cleanAppId).filter((id) => id.length > 0)),
  ];
  const result = new Map<string, GroupPlayable>();
  if (ids.length === 0) return result;

  let consecutiveRetries = 0;
  for (let i = 0; i < ids.length; i += 1) {
    if (i > 0) await wait(STEAM_GAP_MS);
    const id = ids[i];
    const lookup = await fetchSteamAppDetails(id);
    if (lookup.status === "classified") {
      result.set(id, lookup.playable);
      consecutiveRetries = 0;
      continue;
    }
    consecutiveRetries += 1;
    if (
      shouldStopSteamEnrichment({
        consecutiveRetries,
        httpStatus: lookup.httpStatus,
      })
    ) {
      break;
    }
  }

  return result;
}

async function upsertGroupPlayable(
  db: Db,
  input: {
    launcher: string;
    externalId: string;
    name: string;
    playable: GroupPlayable;
    source: string;
  },
): Promise<void> {
  await db.pool.query(
    `
      INSERT INTO game_meta (
        launcher, external_id, name, group_playable,
        group_playable_source, fetched_at
      )
      VALUES ($1, $2, $3, $4, $5, now())
      ON CONFLICT (launcher, external_id) DO UPDATE SET
        group_playable = EXCLUDED.group_playable,
        group_playable_source = EXCLUDED.group_playable_source,
        fetched_at = now()
      WHERE game_meta.group_playable_source IS NULL
    `,
    [
      input.launcher,
      input.externalId,
      input.name,
      input.playable,
      input.source,
    ],
  );
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
  const missing = ids
    .filter((id) => !already.has(id))
    .slice(0, STEAM_DETAILS_PER_RUN);
  if (missing.length === 0) return 0;

  let written = 0;
  let consecutiveRetries = 0;
  for (let i = 0; i < missing.length; i += 1) {
    if (i > 0) await wait(STEAM_GAP_MS);
    const id = missing[i];
    const lookup = await fetchSteamAppDetails(id);
    if (lookup.status === "classified") {
      await upsertGroupPlayable(db, {
        launcher: "steam",
        externalId: id,
        name: unique.get(id) ?? id,
        playable: lookup.playable,
        source: "steam_store",
      });
      written += 1;
      consecutiveRetries = 0;
      continue;
    }
    consecutiveRetries += 1;
    if (
      shouldStopSteamEnrichment({
        consecutiveRetries,
        httpStatus: lookup.httpStatus,
      })
    ) {
      break;
    }
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

async function loadKnownGroupPlayableKeys(
  db: Db,
  games: Array<{ launcher: string; externalId: string }>,
): Promise<Set<string>> {
  if (games.length === 0) return new Set();
  const known = await db.pool.query<{ launcher: string; external_id: string }>(
    `
      SELECT gm.launcher, gm.external_id
      FROM game_meta gm
      JOIN unnest($1::text[], $2::text[]) AS x(launcher, external_id)
        ON gm.launcher = x.launcher AND gm.external_id = x.external_id
      WHERE gm.group_playable_source IS NOT NULL
    `,
    [
      games.map((game) => game.launcher),
      games.map((game) => game.externalId),
    ],
  );
  return new Set(
    known.rows.map((row) => `${row.launcher}:${row.external_id}`),
  );
}

async function copyGroupPlayableByTitle(
  db: Db,
  games: Array<{ launcher: string; externalId: string; name: string }>,
): Promise<number> {
  const candidates = games.filter(
    (game) => game.launcher !== "steam" && game.launcher !== "riot",
  );
  if (candidates.length === 0) return 0;

  const byTitle = await loadGroupPlayableByTitle(db);
  if (byTitle.size === 0) return 0;

  const already = await loadKnownGroupPlayableKeys(db, candidates);
  let written = 0;
  for (const game of candidates) {
    if (already.has(`${game.launcher}:${game.externalId}`)) continue;
    const playable = byTitle.get(normalizeGameTitle(game.name));
    if (playable == null) continue;
    await upsertGroupPlayable(db, {
      launcher: game.launcher,
      externalId: game.externalId,
      name: game.name,
      playable,
      source: "steam_title",
    });
    written += 1;
  }
  return written;
}

async function searchSteamAppId(name: string): Promise<SteamSearchLookup> {
  try {
    const url = new URL("https://store.steampowered.com/api/storesearch/");
    url.searchParams.set("term", name);
    url.searchParams.set("l", "english");
    url.searchParams.set("cc", "US");
    const response = await fetch(url, {
      headers: { "User-Agent": "PlayNext/0.1" },
    });
    if (!response.ok) return { status: "retry" };
    const data = (await response.json()) as StoreSearch;
    const wanted = normalizeGameTitle(name);
    if (!wanted) return { status: "miss" };
    for (const item of data.items ?? []) {
      if (item.type && item.type !== "app") continue;
      if (!item.id) continue;
      if (normalizeGameTitle(item.name ?? "") === wanted) {
        return { status: "match", appId: String(item.id) };
      }
    }
    return { status: "miss" };
  } catch {
    return { status: "retry" };
  }
}

async function persistMissingGroupPlayableBySteamTitle(
  db: Db,
  games: Array<{ launcher: string; externalId: string; name: string }>,
): Promise<number> {
  const unique = new Map<
    string,
    { launcher: string; externalId: string; name: string }
  >();
  const byTitle = await loadGroupPlayableByTitle(db);
  for (const game of games) {
    if (game.launcher === "steam" || game.launcher === "riot") continue;
    if (byTitle.has(normalizeGameTitle(game.name))) continue;
    const key = `${game.launcher}:${game.externalId}`;
    if (!unique.has(key)) unique.set(key, game);
  }
  if (unique.size === 0) return 0;

  const already = await loadKnownGroupPlayableKeys(db, [...unique.values()]);
  const missing = [...unique.values()]
    .filter((game) => !already.has(`${game.launcher}:${game.externalId}`))
    .slice(0, STEAM_SEARCH_PER_RUN);
  if (missing.length === 0) return 0;

  let written = 0;
  let consecutiveRetries = 0;
  for (let i = 0; i < missing.length; i += 1) {
    if (i > 0) await wait(STEAM_GAP_MS);
    const game = missing[i];
    const lookup = await searchSteamAppId(game.name);
    let details: SteamDetailsLookup | null = null;
    if (lookup.status === "match") {
      await wait(STEAM_GAP_MS);
      details = await fetchSteamAppDetails(lookup.appId);
    }
    const decision = steamTitleSearchWrite(lookup, details);
    if (!decision.write) {
      consecutiveRetries += 1;
      if (shouldStopSteamEnrichment({ consecutiveRetries })) break;
      continue;
    }
    await upsertGroupPlayable(db, {
      launcher: game.launcher,
      externalId: game.externalId,
      name: game.name,
      playable: decision.playable,
      source: decision.source,
    });
    written += 1;
    consecutiveRetries = 0;
  }
  return written;
}

let enriching: Promise<void> | null = null;

export async function persistMissingGroupPlayable(
  db: Db,
  games: Array<{ launcher: string; externalId: string; name: string }>,
): Promise<void> {
  if (enriching) return enriching;
  enriching = (async () => {
    await persistMissingSteamGroupPlayable(
      db,
      games.filter((game) => game.launcher === "steam"),
    );
    await copyGroupPlayableByTitle(db, games);
    await persistMissingGroupPlayableBySteamTitle(db, games);
  })().finally(() => {
    enriching = null;
  });
  return enriching;
}
