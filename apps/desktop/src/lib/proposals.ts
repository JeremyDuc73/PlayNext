import { apiFetch } from "./api";

export type ProposalReplyValue = "hot" | "no";

export type ProposalMemberStatus = "hot" | "no" | "pending";

export type ProposalMember = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  owns: boolean;
  status: ProposalMemberStatus;
};

export type GameProposal = {
  id: string;
  groupId: string;
  createdBy: string;
  launcher: "steam";
  externalId: string;
  name: string;
  coverUrl: string | null;
  steamUrl: string;
  priceLabel: string | null;
  status: "open" | "closed";
  ownedCount: number;
  memberCount: number;
  missingCount: number;
  pendingCount: number;
  iOwn: boolean;
  myReply: ProposalReplyValue | null;
  canReply: boolean;
  canCreateEvening: boolean;
  canClose: boolean;
  members: ProposalMember[];
};

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
    message?: string;
  } | null;
  return body?.message ?? body?.error ?? `http_${response.status}`;
}

export async function listProposals(groupId: string): Promise<GameProposal[]> {
  const response = await apiFetch(`/groups/${groupId}/proposals`);
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as {
    ok: boolean;
    proposals: GameProposal[];
  };
  return data.proposals;
}

export async function createProposal(
  groupId: string,
  appId: string,
): Promise<GameProposal> {
  const response = await apiFetch(`/groups/${groupId}/proposals`, {
    method: "POST",
    body: JSON.stringify({ appId }),
  });
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as {
    ok: boolean;
    proposal: GameProposal;
  };
  return data.proposal;
}

export async function replyProposal(
  groupId: string,
  proposalId: string,
  value: ProposalReplyValue,
): Promise<GameProposal> {
  const response = await apiFetch(
    `/groups/${groupId}/proposals/${proposalId}/reply`,
    {
      method: "POST",
      body: JSON.stringify({ value }),
    },
  );
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as {
    ok: boolean;
    proposal: GameProposal;
  };
  return data.proposal;
}

export async function closeProposal(
  groupId: string,
  proposalId: string,
): Promise<void> {
  const response = await apiFetch(
    `/groups/${groupId}/proposals/${proposalId}/close`,
    { method: "POST" },
  );
  if (!response.ok) throw new Error(await readError(response));
}

export function proposalReplyLabel(value: ProposalReplyValue): string {
  if (value === "hot") return "Chaud";
  return "Non";
}

export function proposalStatusLabel(status: ProposalMemberStatus): string {
  if (status === "pending") return "En attente";
  return proposalReplyLabel(status);
}
