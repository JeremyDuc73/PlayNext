import { invoke } from "@tauri-apps/api/core";
import { apiFetch } from "./api";

export type SteamScanResult = {
  steamFound: boolean;
  libraryCount: number;
  steamId: string | null;
  games: Array<{
    launcher: "steam";
    externalId: string;
    name: string;
    installed: boolean;
    owned: boolean;
    launchable: boolean;
  }>;
  warnings: string[];
};

export async function scanSteamLocal(): Promise<SteamScanResult> {
  const result = await invoke<SteamScanResult>("scan_steam");
  return {
    steamFound: result.steamFound,
    libraryCount: result.libraryCount ?? 0,
    steamId: result.steamId ?? null,
    warnings: result.warnings ?? [],
    games: (result.games ?? []).map((game) => ({
      launcher: "steam" as const,
      externalId: game.externalId,
      name: game.name,
      installed: game.installed,
      owned: game.owned,
      launchable: game.launchable,
    })),
  };
}

export type SteamCatalogHit = {
  appId: string;
  name: string;
  steamUrl: string;
  coverUrl: string;
  priceLabel: string;
};

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
    message?: string;
  } | null;
  return body?.message ?? body?.error ?? `http_${response.status}`;
}

export async function searchSteamStore(
  query: string,
): Promise<SteamCatalogHit[]> {
  const response = await apiFetch(
    `/steam/search?q=${encodeURIComponent(query.trim())}`,
  );
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as {
    results: SteamCatalogHit[];
  };
  return data.results;
}
