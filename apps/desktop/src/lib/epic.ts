import { invoke } from "@tauri-apps/api/core";

export type EpicScanResult = {
  epicFound: boolean;
  manifestCount: number;
  games: Array<{
    launcher: "epic";
    externalId: string;
    name: string;
    installed: boolean;
    owned: boolean;
    launchable: boolean;
  }>;
  warnings: string[];
};

export async function scanEpicLocal(): Promise<EpicScanResult> {
  const result = await invoke<EpicScanResult>("scan_epic");
  return {
    epicFound: result.epicFound,
    manifestCount: result.manifestCount ?? 0,
    warnings: result.warnings ?? [],
    games: (result.games ?? []).map((game) => ({
      launcher: "epic" as const,
      externalId: game.externalId,
      name: game.name,
      installed: true,
      owned: true,
      launchable: true,
    })),
  };
}
