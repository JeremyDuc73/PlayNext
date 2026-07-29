import { invoke } from "@tauri-apps/api/core";
import type { SteamGamePayload } from "./api";

export type SteamScanResult = {
  steamFound: boolean;
  libraryCount: number;
  steamId?: string | null;
  games: SteamGamePayload[];
  warnings: string[];
};

export async function scanSteamLocal(): Promise<SteamScanResult> {
  const result = await invoke<SteamScanResult>("scan_steam");
  // Defensive: only keep sync-safe fields (never paths).
  return {
    steamFound: result.steamFound,
    libraryCount: result.libraryCount,
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
