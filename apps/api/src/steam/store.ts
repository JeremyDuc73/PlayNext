import type { Db } from "../db.js";
import type { Env } from "../config.js";
import { isIgdbConfigured } from "../config.js";
import { lookupIgdbGroupPlayable } from "../meta/igdb-manual.js";
import {
  mergeGroupPlayable,
  normalizeGameTitle,
  catalogSearchTerm,
  pickCatalogMatch,
} from "../library/filter.js";

export type GroupPlayable = boolean | null;

/** Un run classe peu de titres : Steam 429 si on burst. Le suivant reprend. */
const STEAM_DETAILS_PER_RUN = 8;
const STEAM_SEARCH_PER_RUN = 5;
const IGDB_PER_RUN = 5;
const STEAM_GAP_MS = 1100;
const STEAM_FETCH_MS = 5000;

const TERMINAL_PLAYABLE_SOURCES = new Set(["igdb", "igdb_miss", "riot"]);

type StoreApp = {
  success?: boolean;
  data?: {
    categories?: Array<{ description?: string }>;
    genres?: Array<{ description?: string }>;
  };
};

type StoreSearch = {
  items?: Array<{ id?: number; name?: string; type?: string }>;
};

export type SteamDetailsLookup =
  | { status: "classified"; playable: GroupPlayable }
  | { status: "retry"; httpStatus?: number };

export type SteamSearchLookup =
  | { status: "retry"; httpStatus?: number }
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

function hasGroupGenre(labels: string[]): boolean {
  return labels.some((label) => /massively multiplayer/i.test(label));
}

function hasSinglePlayerMode(labels: string[]): boolean {
  return labels.some((label) => /single-player|singleplayer/i.test(label));
}

export function groupPlayableFromSteamCategories(
  labels: string[],
  genres: string[] = [],
): GroupPlayable {
  const normalized = labels
    .map((label) => label.trim().toLowerCase())
    .filter(Boolean);
  const genreLabels = genres
    .map((label) => label.trim().toLowerCase())
    .filter(Boolean);
  if (hasGroupMode(normalized) || hasGroupGenre(genreLabels)) return true;
  if (hasSinglePlayerMode(normalized)) return false;
  return null;
}

export function shouldStopSteamEnrichment(input: {
  httpStatus?: number;
}): boolean {
  return input.httpStatus === 429 || input.httpStatus === 403;
}

export function isGroupPlayableQueued(input: {
  launcher: string;
  groupPlayable: boolean | null;
  source?: string | null;
  igdbConfigured?: boolean;
}): boolean {
  if (input.groupPlayable != null) return false;
  if (input.launcher === "riot") return false;
  if (input.source && TERMINAL_PLAYABLE_SOURCES.has(input.source)) return false;
  if (input.igdbConfigured === false && input.source) return false;
  return true;
}

export type GroupPlayableKind = "multi" | "solo" | "pending" | "unknown";

export function groupPlayableKind(input: {
  launcher: string;
  groupPlayable: boolean | null;
  source?: string | null;
  igdbConfigured?: boolean;
}): GroupPlayableKind {
  if (input.groupPlayable === true) return "multi";
  if (input.groupPlayable === false) return "solo";
  if (isGroupPlayableQueued(input)) return "pending";
  return "unknown";
}

export function takeRoundRobin<T>(
  items: T[],
  offset: number,
  limit: number,
): { slice: T[]; nextOffset: number } {
  if (items.length === 0 || limit <= 0) {
    return { slice: [], nextOffset: 0 };
  }
  const start = ((offset % items.length) + items.length) % items.length;
  const count = Math.min(limit, items.length);
  const slice: T[] = [];
  for (let i = 0; i < count; i += 1) {
    slice.push(items[(start + i) % items.length]);
  }
  return { slice, nextOffset: start + count };
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
  if (!details || details.status === "retry") {
    if (details?.status === "retry" && details.httpStatus === 200) {
      return {
        write: true,
        playable: null,
        source: "steam_store_search",
      };
    }
    return { write: false };
  }
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

async function steamFetch(url: URL): Promise<Response> {
  return fetch(url, {
    headers: {
      "User-Agent": "PlayNext/0.1",
      // Store : jeux 18+ / casino (ex. Monopoly Poker) renvoient sinon success:false.
      Cookie:
        "birthtime=568022401; lastagecheckage=1-January-1988; mature_content=1; wants_mature_content=1",
    },
    signal: AbortSignal.timeout(STEAM_FETCH_MS),
  });
}

async function fetchSteamAppDetails(id: string): Promise<SteamDetailsLookup> {
  try {
    const url = new URL("https://store.steampowered.com/api/appdetails");
    url.searchParams.set("appids", id);
    url.searchParams.set("l", "english");
    url.searchParams.set("cc", "US");

    const response = await steamFetch(url);
    if (!response.ok) {
      return { status: "retry", httpStatus: response.status };
    }

    const data = (await response.json()) as Record<string, StoreApp>;
    const app = data[id];
    // AppID absent du Store (pas un 429 : on libère la file).
    if (!app?.success) return { status: "retry", httpStatus: 200 };

    const labels = (app.data?.categories ?? [])
      .map((category) => category.description ?? "")
      .filter(Boolean);
    const genres = (app.data?.genres ?? [])
      .map((genre) => genre.description ?? "")
      .filter(Boolean);
    return {
      status: "classified",
      playable: groupPlayableFromSteamCategories(labels, genres),
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

  for (let i = 0; i < ids.length; i += 1) {
    if (i > 0) await wait(STEAM_GAP_MS);
    const id = ids[i];
    const lookup = await fetchSteamAppDetails(id);
    if (lookup.status === "classified") {
      result.set(id, lookup.playable);
      continue;
    }
    if (shouldStopSteamEnrichment({ httpStatus: lookup.httpStatus })) {
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
      WHERE game_meta.group_playable IS NULL
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

let steamScanOffset = 0;
let titleScanOffset = 0;
let igdbScanOffset = 0;

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
  const pending = ids.filter((id) => !already.has(id));
  const { slice: missing, nextOffset } = takeRoundRobin(
    pending,
    steamScanOffset,
    STEAM_DETAILS_PER_RUN,
  );
  if (missing.length === 0) return 0;

  let written = 0;
  let hitRateLimit = false;
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
      continue;
    }
    if (shouldStopSteamEnrichment({ httpStatus: lookup.httpStatus })) {
      hitRateLimit = true;
      break;
    }
    // 200 + success:false : l’AppID n’est pas au Store. On libère la file.
    if (lookup.httpStatus === 200) {
      await upsertGroupPlayable(db, {
        launcher: "steam",
        externalId: id,
        name: unique.get(id) ?? id,
        playable: null,
        source: "steam_store",
      });
      written += 1;
    }
  }
  if (!hitRateLimit) steamScanOffset = nextOffset;
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
      WHERE gm.group_playable IS NOT NULL
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
    const term = catalogSearchTerm(name);
    if (!term) return { status: "miss" };
    const url = new URL("https://store.steampowered.com/api/storesearch/");
    url.searchParams.set("term", term);
    url.searchParams.set("l", "english");
    url.searchParams.set("cc", "US");
    const response = await steamFetch(url);
    if (!response.ok) {
      return {
        status: "retry",
        ...(response.status === 429 || response.status === 403
          ? { httpStatus: response.status }
          : {}),
      };
    }
    const data = (await response.json()) as StoreSearch;
    const match = pickCatalogMatch(
      name,
      (data.items ?? []).filter(
        (item) => (!item.type || item.type === "app") && item.id,
      ),
      (item) => item.name ?? "",
    );
    if (!match?.id) return { status: "miss" };
    return { status: "match", appId: String(match.id) };
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
  const pending = [...unique.values()].filter(
    (game) => !already.has(`${game.launcher}:${game.externalId}`),
  );
  const { slice: missing, nextOffset } = takeRoundRobin(
    pending,
    titleScanOffset,
    STEAM_SEARCH_PER_RUN,
  );
  if (missing.length === 0) return 0;

  let written = 0;
  let hitRateLimit = false;
  for (let i = 0; i < missing.length; i += 1) {
    if (i > 0) await wait(STEAM_GAP_MS);
    const game = missing[i];
    const lookup = await searchSteamAppId(game.name);
    if (shouldStopSteamEnrichment({ httpStatus: lookup.status === "retry" ? lookup.httpStatus : undefined })) {
      hitRateLimit = true;
      break;
    }
    let details: SteamDetailsLookup | null = null;
    if (lookup.status === "match") {
      await wait(STEAM_GAP_MS);
      details = await fetchSteamAppDetails(lookup.appId);
      if (
        shouldStopSteamEnrichment({
          httpStatus:
            details.status === "retry" ? details.httpStatus : undefined,
        })
      ) {
        hitRateLimit = true;
        break;
      }
    }
    const decision = steamTitleSearchWrite(lookup, details);
    if (!decision.write) continue;
    await upsertGroupPlayable(db, {
      launcher: game.launcher,
      externalId: game.externalId,
      name: game.name,
      playable: decision.playable,
      source: decision.source,
    });
    written += 1;
  }
  if (!hitRateLimit) titleScanOffset = nextOffset;
  return written;
}

async function persistUnknownViaIgdb(
  db: Db,
  games: Array<{ launcher: string; externalId: string; name: string }>,
  config: Env,
): Promise<number> {
  if (!isIgdbConfigured(config)) return 0;
  const unique = new Map<
    string,
    { launcher: string; externalId: string; name: string }
  >();
  for (const game of games) {
    if (game.launcher === "riot") continue;
    const key = `${game.launcher}:${game.externalId}`;
    if (!unique.has(key)) unique.set(key, game);
  }
  if (unique.size === 0) return 0;

  const rows = await db.pool.query<{
    launcher: string;
    external_id: string;
    group_playable: boolean | null;
    group_playable_source: string | null;
  }>(
    `
      SELECT gm.launcher, gm.external_id, gm.group_playable, gm.group_playable_source
      FROM game_meta gm
      JOIN unnest($1::text[], $2::text[]) AS x(launcher, external_id)
        ON gm.launcher = x.launcher AND gm.external_id = x.external_id
    `,
    [
      [...unique.values()].map((game) => game.launcher),
      [...unique.values()].map((game) => game.externalId),
    ],
  );
  const byKey = new Map(
    rows.rows.map((row) => [`${row.launcher}:${row.external_id}`, row]),
  );
  const pending = [...unique.values()].filter((game) => {
    const row = byKey.get(`${game.launcher}:${game.externalId}`);
    if (
      !isGroupPlayableQueued({
        launcher: game.launcher,
        groupPlayable: row?.group_playable ?? null,
        source: row?.group_playable_source,
        igdbConfigured: true,
      })
    ) {
      return false;
    }
    // Steam sans source : l’AppID Store n’a pas encore été interrogé.
    if (game.launcher === "steam" && !row?.group_playable_source) return false;
    return true;
  });
  const { slice: missing, nextOffset } = takeRoundRobin(
    pending,
    igdbScanOffset,
    IGDB_PER_RUN,
  );
  if (missing.length === 0) return 0;

  let written = 0;
  let hitRetry = false;
  for (let i = 0; i < missing.length; i += 1) {
    if (i > 0) await wait(STEAM_GAP_MS);
    const game = missing[i];
    const lookup = await lookupIgdbGroupPlayable(config, game.name);
    if (lookup.status === "retry") {
      hitRetry = true;
      break;
    }
    await upsertGroupPlayable(db, {
      launcher: game.launcher,
      externalId: game.externalId,
      name: game.name,
      playable: lookup.status === "classified" ? lookup.playable : null,
      source: lookup.status === "classified" ? "igdb" : "igdb_miss",
    });
    written += 1;
  }
  if (!hitRetry) igdbScanOffset = nextOffset;
  return written;
}

export function gamesSharingNormalizedTitle<
  T extends { name: string },
>(games: T[], name: string): T[] {
  const key = normalizeGameTitle(name);
  if (!key) return [];
  return games.filter((game) => normalizeGameTitle(game.name) === key);
}

export async function stampManualGroupPlayable(
  db: Db,
  games: Array<{ launcher: string; externalId: string; name: string }>,
  playable: boolean,
): Promise<number> {
  let written = 0;
  for (const game of games) {
    await upsertGroupPlayable(db, {
      launcher: game.launcher,
      externalId: game.externalId,
      name: game.name,
      playable,
      source: "manual",
    });
    written += 1;
  }
  return written;
}

export async function clearManualGroupPlayable(
  db: Db,
  games: Array<{ launcher: string; externalId: string }>,
): Promise<number> {
  if (games.length === 0) return 0;
  const result = await db.pool.query(
    `
      UPDATE game_meta gm
      SET group_playable = NULL,
          group_playable_source = NULL,
          fetched_at = now()
      FROM unnest($1::text[], $2::text[]) AS x(launcher, external_id)
      WHERE gm.launcher = x.launcher
        AND gm.external_id = x.external_id
        AND gm.group_playable_source = 'manual'
    `,
    [
      games.map((game) => game.launcher),
      games.map((game) => game.externalId),
    ],
  );
  return result.rowCount ?? 0;
}

export async function reopenUnknownGroupPlayable(
  db: Db,
  games: Array<{ launcher: string; externalId: string }>,
): Promise<number> {
  if (games.length === 0) return 0;
  const result = await db.pool.query(
    `
      UPDATE game_meta gm
      SET group_playable = NULL,
          group_playable_source = NULL,
          fetched_at = now()
      FROM unnest($1::text[], $2::text[]) AS x(launcher, external_id)
      WHERE gm.launcher = x.launcher
        AND gm.external_id = x.external_id
        AND gm.group_playable IS NULL
        AND gm.group_playable_source IS NOT NULL
        AND gm.group_playable_source NOT IN ('manual', 'riot')
    `,
    [
      games.map((game) => game.launcher),
      games.map((game) => game.externalId),
    ],
  );
  return result.rowCount ?? 0;
}

let enriching: Promise<void> | null = null;

export async function persistMissingGroupPlayable(
  db: Db,
  games: Array<{ launcher: string; externalId: string; name: string }>,
  config?: Env,
): Promise<void> {
  const previous = enriching;
  const run = (async () => {
    if (previous) await previous;
    await persistMissingSteamGroupPlayable(
      db,
      games.filter((game) => game.launcher === "steam"),
    );
    await copyGroupPlayableByTitle(db, games);
    await persistMissingGroupPlayableBySteamTitle(db, games);
    if (config) await persistUnknownViaIgdb(db, games, config);
  })().finally(() => {
    if (enriching === run) enriching = null;
  });
  enriching = run;
  return run;
}
