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

function steamPosterAsset(appId: string, filename: string): string {
  return `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appId}/${filename}`;
}

const RIOT_COVERS: Record<string, string> = {
  league_of_legends:
    "https://static-cdn.jtvnw.net/ttv-boxart/League%20of%20Legends.jpg",
  valorant: "https://static-cdn.jtvnw.net/ttv-boxart/VALORANT.jpg",
};

export function riotCoverUrl(
  launcher: string | undefined,
  externalId: string | undefined,
): string | null {
  if (launcher !== "riot" || !externalId) return null;
  return RIOT_COVERS[externalId] ?? null;
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

  if (input.launcher === "steam" && input.externalId) {
    const id = input.externalId.replace(/[^\d]/g, "");
    if (id) {
      push(input.coverUrl);
      push(steamPosterAsset(id, "library_600x900_2x.jpg"));
      push(steamPosterAsset(id, "library_600x900.jpg"));
      for (const fallback of input.fallbackUrls ?? []) push(fallback);
    }
  } else if (input.launcher === "riot") {
    push(input.coverUrl);
    push(riotCoverUrl(input.launcher, input.externalId));
    push(input.fallbackUrls?.[0]);
  } else {
    push(input.coverUrl);
    // Les launchers non-Steam ne possèdent pas de ladder fiable :
    // une seule URL stable évite les changements d’art aléatoires.
    push(input.fallbackUrls?.[0]);
  }

  return list;
}

export const COVER_LOAD_TIMEOUT_MS = 5000;
