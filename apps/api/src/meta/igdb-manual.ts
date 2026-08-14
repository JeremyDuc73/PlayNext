import type { Env } from "../config.js";
import { isIgdbConfigured } from "../config.js";
import {
  groupPlayableFromIgdbModes,
  catalogSearchTerm,
  pickCatalogMatch,
} from "../library/filter.js";

type TokenCache = {
  token: string;
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;

export type ManualCatalogGame = {
  igdbId: number;
  name: string;
  coverImageId: string | null;
  coverUrl: string | null;
  year: number | null;
  groupPlayable: boolean | null;
};

function igdbCoverUrl(imageId: string): string {
  return `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/${imageId}.jpg`;
}

async function getToken(config: Env): Promise<string | null> {
  if (!isIgdbConfigured(config)) return null;
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }

  const url = new URL("https://id.twitch.tv/oauth2/token");
  url.searchParams.set("client_id", config.TWITCH_CLIENT_ID);
  url.searchParams.set("client_secret", config.TWITCH_CLIENT_SECRET);
  url.searchParams.set("grant_type", "client_credentials");
  const response = await fetch(url, { method: "POST" });
  if (!response.ok) return null;

  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!data.access_token || !data.expires_in) return null;
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return tokenCache.token;
}

async function post<T>(
  config: Env,
  body: string,
): Promise<T[] | null> {
  const token = await getToken(config);
  if (!token) return null;
  const response = await fetch("https://api.igdb.com/v4/games", {
    method: "POST",
    headers: {
      "Client-ID": config.TWITCH_CLIENT_ID,
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/plain",
      Accept: "application/json",
    },
    body,
  });
  if (!response.ok) return null;
  return (await response.json()) as T[];
}

function mapGame(raw: {
  id: number;
  name?: string;
  cover?: { image_id?: string };
  first_release_date?: number;
  game_modes?: number[];
}): ManualCatalogGame {
  const coverImageId = raw.cover?.image_id ?? null;
  return {
    igdbId: raw.id,
    name: raw.name?.trim() || "Jeu sans nom",
    coverImageId,
    coverUrl: coverImageId ? igdbCoverUrl(coverImageId) : null,
    year: raw.first_release_date
      ? new Date(raw.first_release_date * 1000).getUTCFullYear()
      : null,
    groupPlayable: groupPlayableFromIgdbModes(raw.game_modes),
  };
}

function escapeSearch(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function searchManualGames(
  config: Env,
  query: string,
): Promise<ManualCatalogGame[]> {
  const value = query.trim().slice(0, 100);
  if (!value) return [];
  type Raw = {
    id: number;
    name?: string;
    cover?: { image_id?: string };
    first_release_date?: number;
    game_modes?: number[];
  };
  const rows = await post<Raw>(
    config,
    `search "${escapeSearch(value)}";\n` +
      "fields name, cover.image_id, first_release_date, game_modes;\n" +
      "where version_parent = null;\n" +
      "limit 12;",
  );
  return (rows ?? []).filter((row) => row.id).map(mapGame);
}

export async function lookupIgdbGroupPlayable(
  config: Env,
  name: string,
): Promise<
  | { status: "retry" }
  | { status: "miss" }
  | { status: "classified"; playable: boolean }
> {
  if (!isIgdbConfigured(config)) return { status: "miss" };
  const value = catalogSearchTerm(name) || name.trim().slice(0, 100);
  if (!value) return { status: "miss" };

  type Raw = {
    id: number;
    name?: string;
    game_modes?: number[];
  };
  const rows = await post<Raw>(
    config,
    `search "${escapeSearch(value.slice(0, 100))}";\n` +
      "fields name, game_modes;\n" +
      "where version_parent = null;\n" +
      "limit 8;",
  );
  if (rows == null) return { status: "retry" };

  const match = pickCatalogMatch(
    name,
    rows.filter((row) => row.id),
    (row) => row.name ?? "",
  );
  if (!match) return { status: "miss" };
  const playable = groupPlayableFromIgdbModes(match.game_modes);
  if (playable == null) return { status: "miss" };
  return { status: "classified", playable };
}

export async function fetchManualGame(
  config: Env,
  igdbId: number,
): Promise<ManualCatalogGame | null> {
  type Raw = {
    id: number;
    name?: string;
    cover?: { image_id?: string };
    first_release_date?: number;
    game_modes?: number[];
  };
  const rows = await post<Raw>(
    config,
    `fields name, cover.image_id, first_release_date, game_modes;\n` +
      `where id = ${Math.floor(igdbId)};\n` +
      "limit 1;",
  );
  const row = rows?.[0];
  return row?.id ? mapGame(row) : null;
}
