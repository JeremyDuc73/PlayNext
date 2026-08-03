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

function steamPosterAsset(appId: string): string {
  const name = "library_600x900.jpg";
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

  if (input.launcher === "steam" && input.externalId) {
    const id = input.externalId.replace(/[^\d]/g, "");
    if (id) {
      push(steamPosterAsset(id));
    }
  } else {
    push(input.coverUrl);
    // Les launchers non-Steam ne possèdent pas de ladder fiable :
    // une seule URL stable évite les changements d’art aléatoires.
    push(input.fallbackUrls?.[0]);
  }

  return list;
}

export const COVER_LOAD_TIMEOUT_MS = 5000;
