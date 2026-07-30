import { apiFetch } from "./api";

export type GameMeta = {
  key: string;
  launcher: string;
  externalId: string;
  name: string;
  coverUrl: string | null;
  fallbackUrls?: string[];
  year: number | null;
  genres: string[];
  source: string;
};

export async function resolveGameMeta(
  items: Array<{ launcher: string; externalId: string; name: string }>,
): Promise<Map<string, GameMeta>> {
  if (items.length === 0) return new Map();

  const response = await apiFetch("/meta/resolve", {
    method: "POST",
    body: JSON.stringify({ items: items.slice(0, 80) }),
  });
  if (!response.ok) return new Map();

  const data = (await response.json()) as { results: GameMeta[] };
  const map = new Map<string, GameMeta>();
  for (const row of data.results) {
    map.set(row.key, row);
  }
  return map;
}

export function metaMapKey(launcher: string, externalId: string): string {
  return `${launcher}:${externalId}`;
}
