import { invoke } from "@tauri-apps/api/core";

export type XboxInstalledPayload = {
  externalId: string;
  name?: string;
};

export type XboxScanResult = {
  packagesFound: boolean;
  packageCount: number;
  games: Array<{
    launcher: "xbox";
    externalId: string;
    name: string;
    installed: boolean;
    owned: boolean;
    launchable: boolean;
  }>;
  warnings: string[];
};

export async function scanXboxLocal(): Promise<XboxScanResult> {
  const result = await invoke<XboxScanResult>("scan_xbox");
  return {
    packagesFound: result.packagesFound,
    packageCount: result.packageCount ?? 0,
    warnings: result.warnings ?? [],
    games: (result.games ?? []).map((game) => ({
      launcher: "xbox" as const,
      externalId: game.externalId,
      name: game.name,
      installed: true,
      owned: true,
      launchable: true,
    })),
  };
}
