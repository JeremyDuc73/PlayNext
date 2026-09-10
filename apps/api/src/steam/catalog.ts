import { riotCoverUrl, steamLibraryPosterUrl, steamStoreUrl } from "../meta/covers.js";
import { groupPlayableFromSteamCategories, steamFetch } from "./store.js";

const SEARCH_LIMIT = 8;

export type FullGameDetails = {
  launcher: string;
  externalId: string;
  name: string;
  summary: string | null;
  description: string | null;
  headerUrl: string | null;
  coverUrl: string | null;
  steamUrl: string | null;
  priceLabel: string | null;
  developers: string[];
  publishers: string[];
  releaseDate: string | null;
  categories: string[];
  genres: string[];
  screenshots: string[];
  groupPlayable: boolean | null;
};

export type SteamCatalogHit = {
  appId: string;
  name: string;
  steamUrl: string;
  coverUrl: string;
  priceLabel: string;
};

export type SteamCatalogSearch =
  | { status: "ok"; hits: SteamCatalogHit[] }
  | { status: "retry"; httpStatus?: number };

export type SteamCatalogApp =
  | { status: "ok"; hit: SteamCatalogHit }
  | { status: "miss" }
  | { status: "retry"; httpStatus?: number };

type StoreSearch = {
  items?: Array<{
    id?: number;
    name?: string;
    type?: string;
    price?: { currency?: string; initial?: number; final?: number };
  }>;
};

type StoreAppDetails = {
  success?: boolean;
  data?: {
    name?: string;
    is_free?: boolean;
    short_description?: string;
    detailed_description?: string;
    about_the_game?: string;
    header_image?: string;
    developers?: string[];
    publishers?: string[];
    price_overview?: {
      currency?: string;
      initial?: number;
      final?: number;
    };
    release_date?: {
      coming_soon?: boolean;
      date?: string;
    };
    categories?: Array<{ id?: number; description?: string }>;
    genres?: Array<{ id?: string; description?: string }>;
    screenshots?: Array<{ id?: number; path_thumbnail?: string; path_full?: string }>;
  };
};

export function stripHtml(html: string | undefined | null): string | null {
  if (!html) return null;
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || null;
}

function cleanAppId(value: string): string {
  return value.replace(/[^\d]/g, "");
}

export function formatSteamPriceLabel(input: {
  isFree?: boolean;
  currency?: string | null;
  finalCents?: number | null;
}): string {
  if (input.isFree || input.finalCents === 0) return "gratuit";
  if (
    input.finalCents == null ||
    !Number.isFinite(input.finalCents) ||
    input.finalCents < 0
  ) {
    return "—";
  }
  const currency =
    input.currency && /^[A-Z]{3}$/.test(input.currency)
      ? input.currency
      : "EUR";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
  }).format(input.finalCents / 100);
}

function toHit(input: {
  appId: string;
  name: string;
  isFree?: boolean;
  currency?: string | null;
  finalCents?: number | null;
}): SteamCatalogHit | null {
  const appId = cleanAppId(input.appId);
  const name = input.name.trim();
  const steamUrl = steamStoreUrl(appId);
  if (!appId || !name || !steamUrl) return null;
  return {
    appId,
    name,
    steamUrl,
    coverUrl: steamLibraryPosterUrl(appId),
    priceLabel: formatSteamPriceLabel({
      isFree: input.isFree,
      currency: input.currency,
      finalCents: input.finalCents,
    }),
  };
}

export async function searchSteamCatalog(
  query: string,
): Promise<SteamCatalogSearch> {
  const term = query.trim().slice(0, 80);
  if (term.length < 2) return { status: "ok", hits: [] };
  try {
    const url = new URL("https://store.steampowered.com/api/storesearch/");
    url.searchParams.set("term", term);
    url.searchParams.set("l", "french");
    url.searchParams.set("cc", "FR");
    const response = await steamFetch(url);
    if (!response.ok) {
      return { status: "retry", httpStatus: response.status };
    }
    const data = (await response.json()) as StoreSearch;
    const hits: SteamCatalogHit[] = [];
    const seen = new Set<string>();
    for (const item of data.items ?? []) {
      if (item.type && item.type !== "app") continue;
      const hit = toHit({
        appId: String(item.id ?? ""),
        name: item.name ?? "",
        currency: item.price?.currency,
        finalCents: item.price?.final,
      });
      if (!hit || seen.has(hit.appId)) continue;
      seen.add(hit.appId);
      hits.push(hit);
      if (hits.length >= SEARCH_LIMIT) break;
    }
    return { status: "ok", hits };
  } catch {
    return { status: "retry" };
  }
}

export async function fetchSteamCatalogApp(
  appId: string,
): Promise<SteamCatalogApp> {
  const id = cleanAppId(appId);
  if (!id) return { status: "miss" };
  try {
    const url = new URL("https://store.steampowered.com/api/appdetails");
    url.searchParams.set("appids", id);
    url.searchParams.set("l", "french");
    url.searchParams.set("cc", "FR");
    const response = await steamFetch(url);
    if (!response.ok) {
      return { status: "retry", httpStatus: response.status };
    }
    const data = (await response.json()) as Record<string, StoreAppDetails>;
    const app = data[id];
    if (!app?.success || !app.data?.name) return { status: "miss" };
    const hit = toHit({
      appId: id,
      name: app.data.name,
      isFree: app.data.is_free,
      currency: app.data.price_overview?.currency,
      finalCents: app.data.price_overview?.final,
    });
    if (!hit) return { status: "miss" };
    return { status: "ok", hit };
  } catch {
    return { status: "retry" };
  }
}

export async function fetchSteamAppFullDetails(
  appId: string,
): Promise<
  | { status: "ok"; details: FullGameDetails }
  | { status: "miss" }
  | { status: "retry"; httpStatus?: number }
> {
  const id = cleanAppId(appId);
  if (!id) return { status: "miss" };
  try {
    const url = new URL("https://store.steampowered.com/api/appdetails");
    url.searchParams.set("appids", id);
    url.searchParams.set("l", "french");
    url.searchParams.set("cc", "FR");
    const response = await steamFetch(url);
    if (!response.ok) {
      return { status: "retry", httpStatus: response.status };
    }
    const data = (await response.json()) as Record<string, StoreAppDetails>;
    const app = data[id];
    if (!app?.success || !app.data?.name) return { status: "miss" };

    const raw = app.data;
    if (!raw?.name) return { status: "miss" };
    const categories = (raw.categories ?? [])
      .map((c) => c.description?.trim() ?? "")
      .filter(Boolean);
    const genres = (raw.genres ?? [])
      .map((g) => g.description?.trim() ?? "")
      .filter(Boolean);
    const screenshots = (raw.screenshots ?? [])
      .map((s) => s.path_full || s.path_thumbnail || "")
      .filter(Boolean)
      .slice(0, 8);

    const priceLabel = formatSteamPriceLabel({
      isFree: raw.is_free,
      currency: raw.price_overview?.currency,
      finalCents: raw.price_overview?.final,
    });

    const groupPlayable = groupPlayableFromSteamCategories(categories, genres);

    const details: FullGameDetails = {
      launcher: "steam",
      externalId: id,
      name: raw.name.trim(),
      summary: stripHtml(raw.short_description),
      description: stripHtml(raw.about_the_game || raw.detailed_description),
      headerUrl: raw.header_image ?? null,
      coverUrl: steamLibraryPosterUrl(id),
      steamUrl: steamStoreUrl(id),
      priceLabel,
      developers: raw.developers ?? [],
      publishers: raw.publishers ?? [],
      releaseDate: raw.release_date?.date?.trim() ?? null,
      categories,
      genres,
      screenshots,
      groupPlayable,
    };

    return { status: "ok", details };
  } catch {
    return { status: "retry" };
  }
}

export async function fetchFullGameDetails(input: {
  launcher: string;
  externalId: string;
  name?: string | null;
}): Promise<FullGameDetails | null> {
  const launcher = input.launcher;
  const externalId = input.externalId;
  const name = input.name?.trim() || "";

  // 1. Steam
  if (launcher === "steam") {
    const res = await fetchSteamAppFullDetails(externalId);
    if (res.status === "ok") return res.details;
    if (name) {
      const search = await searchSteamCatalog(name);
      if (search.status === "ok" && search.hits.length > 0) {
        const fallback = await fetchSteamAppFullDetails(search.hits[0]!.appId);
        if (fallback.status === "ok") return fallback.details;
      }
    }
    return null;
  }

  // 2. Riot
  if (launcher === "riot") {
    if (externalId === "league_of_legends") {
      return {
        launcher: "riot",
        externalId: "league_of_legends",
        name: "League of Legends",
        summary:
          "League of Legends est un jeu de stratégie en équipe compétitif où deux équipes de cinq champions s'affrontent pour détruire la base adverse.",
        description:
          "Choisissez parmi plus de 140 champions pour réaliser des actions épiques, éliminer des adversaires et abattre des tourelles afin d'arracher la victoire en équipe.",
        headerUrl:
          "https://images.contentstack.io/v3/assets/blt731acb42bb3d1659/blt1259b140d30c5e7c/63895e791238691090333d02/LoL_Logo_Flat_Gold.png",
        coverUrl: riotCoverUrl("riot", "league_of_legends"),
        steamUrl: null,
        priceLabel: "gratuit",
        developers: ["Riot Games"],
        publishers: ["Riot Games"],
        releaseDate: "27 octobre 2009",
        categories: ["Multijoueur", "JcJ en ligne", "Coopération contre bots"],
        genres: ["MOBA", "Stratégie", "Compétitif"],
        screenshots: [],
        groupPlayable: true,
      };
    }
    if (externalId === "valorant") {
      return {
        launcher: "riot",
        externalId: "valorant",
        name: "VALORANT",
        summary:
          "VALORANT est un jeu de tir tactique à la première personne en 5c5 avec des compétences uniques d'agents et des fusillades précises.",
        description:
          "Défiez vos limites et créez votre propre style dans une arène compétitive internationale. Vous disposez de 13 manches pour attaquer et défendre votre camp avec vos coéquipiers.",
        headerUrl:
          "https://images.contentstack.io/v3/assets/bltb6530b271fddd0b1/blt781b0a8809462ad6/62ce0d96d274531061c024d6/VALORANT_Logo_OffWhite.png",
        coverUrl: riotCoverUrl("riot", "valorant"),
        steamUrl: null,
        priceLabel: "gratuit",
        developers: ["Riot Games"],
        publishers: ["Riot Games"],
        releaseDate: "2 juin 2020",
        categories: ["Multijoueur", "JcJ en ligne", "5c5 compétitif"],
        genres: ["FPS", "Tactique", "Compétitif"],
        screenshots: [],
        groupPlayable: true,
      };
    }
  }

  // 3. Other launchers (Xbox, Epic, manual): match via Steam Store in French
  if (name) {
    const search = await searchSteamCatalog(name);
    if (search.status === "ok" && search.hits.length > 0) {
      const match = await fetchSteamAppFullDetails(search.hits[0]!.appId);
      if (match.status === "ok") {
        return {
          ...match.details,
          launcher,
          externalId,
        };
      }
    }
  }

  // Fallback
  return {
    launcher,
    externalId,
    name: name || externalId,
    summary: null,
    description: null,
    headerUrl: null,
    coverUrl: null,
    steamUrl: null,
    priceLabel: null,
    developers: [],
    publishers: [],
    releaseDate: null,
    categories: [],
    genres: [],
    screenshots: [],
    groupPlayable: null,
  };
}
