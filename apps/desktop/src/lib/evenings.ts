import { apiFetch } from "./api";

export type VoteValue = "hot" | "maybe" | "pass" | "veto";
export type EveningStatus =
  | "lobby"
  | "selection"
  | "voting"
  | "revealed"
  | "closed"
  | "cancelled";
export type EveningVibe =
  | "chill"
  | "competitive"
  | "campaign"
  | "party"
  | "any";

export type EveningCandidate = {
  id: string;
  round: number;
  launcher: string;
  externalId: string;
  name: string;
  ownedCount: number;
  installedCount: number;
  participantCount: number;
  reasons: string[];
  eliminated: boolean;
  eliminatedReason: string | null;
  ownedByMe: boolean;
  selectedByMe: boolean;
  myVote: VoteValue | null;
  tally: {
    hot: number;
    maybe: number;
    pass: number;
    veto: number;
    score: number;
    eliminated: boolean;
    eliminatedReason: string | null;
  } | null;
};

export type EveningParticipant = {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  present: boolean;
  vetoAvailable: boolean;
  selectionSubmitted: boolean;
  ready: boolean;
  readyAt: string | null;
  hasVoted: boolean;
};

export type Evening = {
  id: string;
  groupId: string;
  createdBy: string;
  status: EveningStatus;
  title: string | null;
  durationMinutes: number | null;
  vibe: EveningVibe | string | null;
  requireOwned: boolean;
  requireInstalled: boolean;
  shortlistSize: number;
  round: number;
  lobbyComplete: boolean;
  selectionComplete: boolean;
  selectionCount: number;
  mySelectionIds: string[];
  currentCandidateIndex: number | null;
  currentCandidateId: string | null;
  currentVotes: number;
  currentVotesTotal: number;
  allVoted: boolean;
  myVetoAvailable: boolean;
  winnerCandidateId: string | null;
  participants: EveningParticipant[];
  candidates: EveningCandidate[];
  resolution: {
    winnerId: string | null;
    tiedIds: string[];
    usedRoulette: boolean;
    allEliminated: boolean;
  } | null;
  createdAt: string;
};

export type EveningSummary = {
  id: string;
  status: EveningStatus;
  title: string | null;
  round: number;
  createdAt: string;
  winnerCandidateId: string | null;
  winnerName: string | null;
};

export type OpenEvening = {
  id: string;
  groupId: string;
  groupName: string;
  status: EveningStatus;
  title: string | null;
  createdAt: string;
};

export function isLiveEveningStatus(status: EveningStatus): boolean {
  return (
    status === "lobby" ||
    status === "selection" ||
    status === "voting" ||
    status === "revealed"
  );
}

export function eveningDisplayTitle(
  title: string | null | undefined,
  createdAt: string,
): string {
  const trimmed = title?.trim();
  if (trimmed) return trimmed;
  return `Soirée du ${new Date(createdAt).toLocaleDateString("fr-FR")}`;
}

export type CreateEveningInput = {
  title?: string;
  durationMinutes?: number | null;
  vibe?: EveningVibe | null;
  requireOwned?: boolean;
  requireInstalled?: boolean;
  shortlistSize?: number;
  participantIds?: string[];
};

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
    message?: string;
  } | null;
  return body?.message ?? body?.error ?? `http_${response.status}`;
}

export async function listEvenings(
  groupId: string,
): Promise<EveningSummary[]> {
  const response = await apiFetch(`/groups/${groupId}/evenings`);
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as {
    evenings: EveningSummary[];
  };
  return data.evenings;
}

export async function createEvening(
  groupId: string,
  input: CreateEveningInput,
): Promise<Evening> {
  const response = await apiFetch(`/groups/${groupId}/evenings`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as { evening: Evening };
  return data.evening;
}

export async function fetchEvening(eveningId: string): Promise<Evening> {
  const response = await apiFetch(`/evenings/${eveningId}`);
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as { evening: Evening };
  return data.evening;
}

export async function fetchOpenEvenings(): Promise<OpenEvening[]> {
  const response = await apiFetch("/me/open-evenings");
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as { evenings: OpenEvening[] };
  return data.evenings;
}

export async function markEveningReady(eveningId: string): Promise<Evening> {
  const response = await apiFetch(`/evenings/${eveningId}/ready`, {
    method: "POST",
  });
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as { evening: Evening };
  return data.evening;
}

export async function openEveningSelection(eveningId: string): Promise<Evening> {
  const response = await apiFetch(`/evenings/${eveningId}/open-selection`, {
    method: "POST",
  });
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as { evening: Evening };
  return data.evening;
}

export async function submitVotes(
  eveningId: string,
  votes: Array<{ candidateId: string; value: VoteValue }>,
): Promise<Evening> {
  const response = await apiFetch(`/evenings/${eveningId}/votes`, {
    method: "POST",
    body: JSON.stringify({ votes }),
  });
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as { evening: Evening };
  return data.evening;
}

export async function submitSelection(
  eveningId: string,
  candidateIds: string[],
): Promise<Evening> {
  const response = await apiFetch(`/evenings/${eveningId}/selections`, {
    method: "POST",
    body: JSON.stringify({ candidateIds }),
  });
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as { evening: Evening };
  return data.evening;
}

export async function startVoting(eveningId: string): Promise<Evening> {
  const response = await apiFetch(`/evenings/${eveningId}/start-voting`, {
    method: "POST",
  });
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as { evening: Evening };
  return data.evening;
}

export async function submitCurrentVote(
  eveningId: string,
  candidateId: string,
  value: VoteValue,
): Promise<Evening> {
  const response = await apiFetch(`/evenings/${eveningId}/current-vote`, {
    method: "POST",
    body: JSON.stringify({ candidateId, value }),
  });
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as { evening: Evening };
  return data.evening;
}

export async function revealEvening(eveningId: string): Promise<Evening> {
  const response = await apiFetch(`/evenings/${eveningId}/reveal`, {
    method: "POST",
  });
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as { evening: Evening };
  return data.evening;
}

export async function closeEvening(
  eveningId: string,
  candidateId?: string,
): Promise<Evening> {
  const response = await apiFetch(`/evenings/${eveningId}/close`, {
    method: "POST",
    body: JSON.stringify(candidateId ? { candidateId } : {}),
  });
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as { evening: Evening };
  return data.evening;
}

export async function rouletteEvening(eveningId: string): Promise<Evening> {
  const response = await apiFetch(`/evenings/${eveningId}/roulette`, {
    method: "POST",
  });
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as { evening: Evening };
  return data.evening;
}

export async function revoteTie(eveningId: string): Promise<Evening> {
  const response = await apiFetch(`/evenings/${eveningId}/revote-tie`, {
    method: "POST",
  });
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as { evening: Evening };
  return data.evening;
}

export async function newEveningRound(eveningId: string): Promise<Evening> {
  const response = await apiFetch(`/evenings/${eveningId}/new-round`, {
    method: "POST",
  });
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as { evening: Evening };
  return data.evening;
}

export async function cancelEvening(eveningId: string): Promise<Evening> {
  const response = await apiFetch(`/evenings/${eveningId}/cancel`, {
    method: "POST",
  });
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as { evening: Evening };
  return data.evening;
}

export async function deleteEvening(eveningId: string): Promise<void> {
  const response = await apiFetch(`/evenings/${eveningId}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(await readError(response));
}

export async function clearEveningHistory(groupId: string): Promise<number> {
  const response = await apiFetch(`/groups/${groupId}/evenings/history`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as { deleted?: number };
  return data.deleted ?? 0;
}

export function voteLabel(value: VoteValue): string {
  switch (value) {
    case "hot":
      return "Chaud";
    case "maybe":
      return "Pourquoi pas";
    case "pass":
      return "Pass";
    case "veto":
      return "Veto";
  }
}

export function vibeLabel(vibe: string | null | undefined): string {
  switch (vibe) {
    case "chill":
      return "Détente";
    case "competitive":
      return "Compétitif";
    case "campaign":
      return "Campagne";
    case "party":
      return "Groupe";
    case "any":
      return "Peu importe";
    default:
      return "—";
  }
}
