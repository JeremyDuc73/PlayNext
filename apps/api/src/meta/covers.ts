/** Covers launcher : Steam CDN (+ TitleHub / Epic via game_meta). */

export function metaKey(launcher: string, externalId: string): string {
  return `${launcher}:${externalId}`;
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
