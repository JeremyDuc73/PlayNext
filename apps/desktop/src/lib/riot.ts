import { invoke } from "@tauri-apps/api/core";

export type RiotScanResult = {
  riotFound: boolean;
  games: Array<{
    launcher: "riot";
    externalId: "league_of_legends" | "valorant";
    name: "League of Legends" | "VALORANT";
    installed: boolean;
    owned: boolean;
    launchable: boolean;
  }>;
  warnings: string[];
};

export async function scanRiotLocal(): Promise<RiotScanResult> {
  const result = await invoke<RiotScanResult>("scan_riot");
  return {
    riotFound: result.riotFound,
    warnings: result.warnings ?? [],
    games: (result.games ?? []).map((game) => ({
      launcher: "riot" as const,
      externalId: game.externalId,
      name: game.name,
      installed: true,
      owned: true,
      launchable: true,
    })),
  };
}
