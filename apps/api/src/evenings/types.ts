export type EveningStatus =
  | "lobby"
  | "selection"
  | "voting"
  | "revealed"
  | "closed"
  | "cancelled";

export const OPEN_EVENING_STATUSES = [
  "lobby",
  "selection",
  "voting",
  "revealed",
] as const satisfies readonly EveningStatus[];

export type EveningKind = "ritual" | "direct";

export type EveningVibe =
  | "chill"
  | "competitive"
  | "campaign"
  | "party"
  | "any";

export type VoteValue = "hot" | "maybe" | "pass" | "veto";

export type LibraryGameAgg = {
  launcher: string;
  externalId: string;
  name: string;
  ownedCount: number;
  installedCount: number;
  participantCount: number;
  /** null = catalogue inconnu, false = pas adapté au jeu de groupe. */
  groupPlayable?: boolean | null;
};

export type ShortlistCandidate = LibraryGameAgg & {
  reasons: string[];
  score: number;
};

export type VoteTally = {
  hot: number;
  maybe: number;
  pass: number;
  veto: number;
  score: number;
  eliminated: boolean;
  eliminatedReason: string | null;
};
