import type { VoteTally, VoteValue } from "./types.js";

const POINTS: Record<Exclude<VoteValue, "veto">, number> = {
  hot: 3,
  maybe: 1,
  pass: 0,
};

export function emptyTally(): VoteTally {
  return {
    hot: 0,
    maybe: 0,
    pass: 0,
    veto: 0,
    score: 0,
    eliminated: false,
    eliminatedReason: null,
  };
}

export function applyVote(tally: VoteTally, value: VoteValue): VoteTally {
  const next = { ...tally };
  next[value] += 1;
  if (value === "veto") {
    next.eliminated = true;
    next.eliminatedReason = "veto";
  } else {
    next.score += POINTS[value];
  }
  return next;
}

export function talliesFromVotes(
  votes: Array<{ candidateId: string; value: VoteValue }>,
): Map<string, VoteTally> {
  const map = new Map<string, VoteTally>();
  for (const vote of votes) {
    const current = map.get(vote.candidateId) ?? emptyTally();
    map.set(vote.candidateId, applyVote(current, vote.value));
  }
  return map;
}

export type ScoredCandidate = {
  candidateId: string;
  tally: VoteTally;
  installedCount: number;
  ownedCount: number;
};

export type ResolveResult = {
  winnerId: string | null;
  tiedIds: string[];
  usedRoulette: boolean;
  allEliminated: boolean;
};

/**
 * Pick a winner among non-eliminated candidates.
 * Tie-break: score → installed → owned → optional roulette among remaining ties.
 */
export function resolveWinner(
  candidates: ScoredCandidate[],
  random: () => number = Math.random,
): ResolveResult {
  const alive = candidates.filter((c) => !c.tally.eliminated);
  if (alive.length === 0) {
    return {
      winnerId: null,
      tiedIds: [],
      usedRoulette: false,
      allEliminated: true,
    };
  }

  const bestScore = Math.max(...alive.map((c) => c.tally.score));
  let pool = alive.filter((c) => c.tally.score === bestScore);

  const bestInstalled = Math.max(...pool.map((c) => c.installedCount));
  pool = pool.filter((c) => c.installedCount === bestInstalled);

  const bestOwned = Math.max(...pool.map((c) => c.ownedCount));
  pool = pool.filter((c) => c.ownedCount === bestOwned);

  if (pool.length === 1) {
    return {
      winnerId: pool[0]!.candidateId,
      tiedIds: [],
      usedRoulette: false,
      allEliminated: false,
    };
  }

  const idx = Math.floor(random() * pool.length);
  const pick = pool[idx]!;
  return {
    winnerId: pick.candidateId,
    tiedIds: pool.map((c) => c.candidateId),
    usedRoulette: true,
    allEliminated: false,
  };
}

/** Games to keep for a new round: not vetoed, and at least one non-pass interest. */
export function candidatesForNewRound(
  candidates: Array<{
    candidateId: string;
    launcher: string;
    externalId: string;
    tally: VoteTally;
  }>,
): Array<{ launcher: string; externalId: string }> {
  return candidates
    .filter((c) => {
      if (c.tally.veto > 0 || c.tally.eliminated) return false;
      return c.tally.hot + c.tally.maybe > 0;
    })
    .map((c) => ({ launcher: c.launcher, externalId: c.externalId }));
}
