import { z } from "zod";

const ownedResponseSchema = z.object({
  response: z.object({
    game_count: z.number().optional(),
    games: z
      .array(
        z.object({
          appid: z.number(),
          name: z.string().optional(),
          playtime_forever: z.number().optional(),
        }),
      )
      .optional(),
  }),
});

export type SteamOwnedGame = {
  externalId: string;
  name: string;
};

export async function fetchSteamOwnedGames(
  apiKey: string,
  steamId: string,
): Promise<SteamOwnedGame[]> {
  const url = new URL(
    "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/",
  );
  url.searchParams.set("key", apiKey);
  url.searchParams.set("steamid", steamId);
  url.searchParams.set("include_appinfo", "true");
  url.searchParams.set("include_played_free_games", "true");

  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Steam owned games failed (${response.status}): ${text}`);
  }

  const json: unknown = await response.json();
  const parsed = ownedResponseSchema.parse(json);
  const games = parsed.response.games ?? [];

  return games.map((game) => ({
    externalId: String(game.appid),
    name: game.name?.trim() || `Steam App ${game.appid}`,
  }));
}

export type SyncGame = {
  launcher: "steam";
  externalId: string;
  name: string;
  installed: boolean;
  owned: boolean;
  launchable: boolean;
};

/** Merge local install scan with Steam owned library. */
export function mergeSteamLibrary(
  localGames: SyncGame[],
  ownedGames: SteamOwnedGame[],
): SyncGame[] {
  const byId = new Map<string, SyncGame>();

  for (const owned of ownedGames) {
    byId.set(owned.externalId, {
      launcher: "steam",
      externalId: owned.externalId,
      name: owned.name,
      installed: false,
      owned: true,
      launchable: false,
    });
  }

  for (const local of localGames) {
    const existing = byId.get(local.externalId);
    if (existing) {
      byId.set(local.externalId, {
        ...existing,
        name: local.name || existing.name,
        installed: local.installed,
        owned: true,
        launchable: local.launchable || local.installed,
      });
    } else {
      byId.set(local.externalId, { ...local, owned: true });
    }
  }

  return [...byId.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "fr", { sensitivity: "base" }),
  );
}
