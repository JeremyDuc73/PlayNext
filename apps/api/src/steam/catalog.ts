import { steamLibraryPosterUrl, steamStoreUrl } from "../meta/covers.js";
import { steamFetch } from "./store.js";

const SEARCH_LIMIT = 8;

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
    price_overview?: {
      currency?: string;
      initial?: number;
      final?: number;
    };
  };
};

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
