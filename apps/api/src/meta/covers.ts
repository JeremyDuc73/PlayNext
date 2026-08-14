/** Covers launcher : Steam CDN (+ TitleHub / Epic via game_meta + Twitch Riot). */

export function metaKey(launcher: string, externalId: string): string {
  return `${launcher}:${externalId}`;
}

const RIOT_COVERS: Record<string, string> = {
  league_of_legends:
    "https://static-cdn.jtvnw.net/ttv-boxart/League%20of%20Legends.jpg",
  valorant: "https://static-cdn.jtvnw.net/ttv-boxart/VALORANT.jpg",
};

export function riotCoverUrl(
  launcher: string,
  externalId: string,
): string | null {
  if (launcher !== "riot") return null;
  return RIOT_COVERS[externalId] ?? null;
}

export function steamLibraryPosterUrl(
  appId: string,
  scale: "" | "_2x" = "_2x",
): string {
  const id = appId.replace(/[^\d]/g, "");
  return `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${id}/library_600x900${scale}.jpg`;
}

export function steamCoverFallbackUrls(appId: string): string[] {
  const id = appId.replace(/[^\d]/g, "");
  if (!id) return [];
  const base = `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${id}`;
  return [
    `${base}/library_600x900_2x.jpg`,
    `${base}/library_600x900.jpg`,
    `${base}/capsule_616x353.jpg`,
    `${base}/header.jpg`,
  ];
}

export function steamStoreUrl(appId: string): string | null {
  const id = appId.replace(/[^\d]/g, "");
  if (!id) return null;
  return `https://store.steampowered.com/app/${id}/`;
}
