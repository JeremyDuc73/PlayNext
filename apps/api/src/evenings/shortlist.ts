import type { LibraryGameAgg, ShortlistCandidate } from "./types.js";

export type ShortlistOptions = {
  requireOwned: boolean;
  requireInstalled: boolean;
  shortlistSize: number;
  /** launcher:externalId keys recently chosen — pushed down for diversity */
  recentWinnerKeys?: Set<string>;
  excludeKeys?: Set<string>;
};

function gameKey(game: LibraryGameAgg): string {
  return `${game.launcher}:${game.externalId}`;
}

export function rankScore(game: LibraryGameAgg): number {
  const allOwn = game.ownedCount === game.participantCount ? 40 : 0;
  const allInstall =
    game.installedCount === game.participantCount && game.participantCount > 0
      ? 30
      : 0;
  return (
    allOwn +
    allInstall +
    game.ownedCount * 5 +
    game.installedCount * 3
  );
}

export function buildReasons(game: LibraryGameAgg): string[] {
  const reasons: string[] = [];
  const { ownedCount, installedCount, participantCount } = game;
  if (participantCount <= 0) return reasons;

  if (ownedCount === participantCount) {
    reasons.push("Possédé par tout le monde");
  } else {
    reasons.push(`Possédé ${ownedCount}/${participantCount}`);
  }

  if (installedCount === participantCount) {
    reasons.push("Installé chez tout le monde");
  } else if (installedCount > 0) {
    reasons.push(`Installé ${installedCount}/${participantCount}`);
  } else {
    reasons.push("Personne ne l’a installé");
  }

  return reasons;
}

/** Pure shortlist engine — unit-tested. */
export function buildShortlist(
  games: LibraryGameAgg[],
  options: ShortlistOptions,
): ShortlistCandidate[] {
  const size = Math.min(12, Math.max(5, options.shortlistSize));
  const recent = options.recentWinnerKeys ?? new Set<string>();
  const exclude = options.excludeKeys ?? new Set<string>();

  const filtered = games.filter((game) => {
    if (exclude.has(gameKey(game))) return false;
    if (game.ownedCount < 1) return false;
    if (options.requireOwned && game.ownedCount < game.participantCount) {
      return false;
    }
    if (
      options.requireInstalled &&
      game.installedCount < game.participantCount
    ) {
      return false;
    }
    return true;
  });

  const ranked = filtered
    .map((game) => {
      const key = gameKey(game);
      const base = rankScore(game);
      const diversityPenalty = recent.has(key) ? 40 : 0;
      return {
        ...game,
        reasons: [
          ...buildReasons(game),
          ...(recent.has(key) ? ["Déjà choisi récemment"] : []),
        ],
        score: base - diversityPenalty,
      } satisfies ShortlistCandidate;
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.installedCount !== a.installedCount) {
        return b.installedCount - a.installedCount;
      }
      if (b.ownedCount !== a.ownedCount) return b.ownedCount - a.ownedCount;
      return a.name.localeCompare(b.name, "fr");
    });

  return ranked.slice(0, size);
}
