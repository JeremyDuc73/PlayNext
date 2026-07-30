/** Affiches launcher : Steam CDN + URL cache (TitleHub / Epic). */

const PALETTES = ["#16191d", "#12161c", "#1a1214", "#141810", "#0f1a18"] as const;

export function hashHue(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function fallbackPosterStyle(name: string): {
  background: string;
  initial: string;
} {
  const h = hashHue(name);
  return {
    background: PALETTES[h % PALETTES.length]!,
    initial: (name.trim().charAt(0) || "?").toUpperCase(),
  };
}

function steamAsset(
  appId: string,
  file: "library_600x900" | "library_hero" | "header" | "capsule_616x353",
  scale: "" | "_2x" = "",
): string {
  const name =
    file === "header" || file === "capsule_616x353"
      ? `${file}.jpg`
      : `${file}${scale}.jpg`;
  return `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appId}/${name}`;
}

export function coverCandidates(input: {
  coverUrl?: string | null;
  launcher?: string;
  externalId?: string;
  fallbackUrls?: string[];
}): string[] {
  const list: string[] = [];
  const push = (url: string | null | undefined) => {
    if (url && !list.includes(url)) list.push(url);
  };

  push(input.coverUrl);
  for (const url of input.fallbackUrls ?? []) push(url);

  if (input.launcher === "steam" && input.externalId) {
    const id = input.externalId.replace(/[^\d]/g, "");
    if (id) {
      push(steamAsset(id, "library_600x900", "_2x"));
      push(steamAsset(id, "library_600x900"));
      push(steamAsset(id, "library_hero", "_2x"));
      push(steamAsset(id, "header"));
      push(steamAsset(id, "capsule_616x353"));
    }
  }

  return list;
}

export const COVER_LOAD_TIMEOUT_MS = 5000;
