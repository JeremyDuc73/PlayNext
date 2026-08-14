import type { GroupPlayableStatus, LibraryGame } from "./api";
import { dedupePreferLaunchers, isJunkGameName } from "./library-filter";

export function playableStatus(game: LibraryGame): GroupPlayableStatus {
  if (game.groupPlayableStatus) return game.groupPlayableStatus;
  if (game.groupPlayable === true) return "multi";
  if (game.groupPlayable === false) return "solo";
  return "pending";
}

export function summarizePlayable(games: LibraryGame[]) {
  const titles = dedupePreferLaunchers(
    games.filter((game) => !isJunkGameName(game.name)),
  );
  let multi = 0;
  let solo = 0;
  let pending = 0;
  let unknown = 0;
  const remaining: LibraryGame[] = [];
  for (const game of titles) {
    const status = playableStatus(game);
    if (status === "multi") {
      multi += 1;
      continue;
    }
    if (status === "solo") {
      solo += 1;
      continue;
    }
    if (status === "pending") pending += 1;
    else unknown += 1;
    remaining.push(game);
  }
  remaining.sort((a, b) => {
    const rank = (game: LibraryGame) =>
      playableStatus(game) === "pending" ? 0 : 1;
    const byStatus = rank(a) - rank(b);
    if (byStatus !== 0) return byStatus;
    return a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
  });
  return {
    total: titles.length,
    classified: multi + solo,
    multi,
    solo,
    pending,
    unknown,
    remaining,
  };
}

export function launcherLabel(launcher: string): string {
  if (launcher === "steam") return "Steam";
  if (launcher === "xbox") return "Xbox";
  if (launcher === "epic") return "Epic";
  if (launcher === "riot") return "Riot";
  if (launcher === "manual") return "Manuel";
  return launcher;
}

export function playableStatusLabel(status: GroupPlayableStatus): string {
  if (status === "multi") return "Multi";
  if (status === "solo") return "Solo";
  if (status === "pending") return "En attente";
  return "Sans réponse";
}
