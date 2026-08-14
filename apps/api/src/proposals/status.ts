import { normalizeGameTitle } from "../library/filter.js";

export type ProposalReplyValue = "hot" | "no";

export type ProposalMemberStatus = "hot" | "no" | "pending";

export function proposalMemberStatus(
  reply: ProposalReplyValue | null,
): ProposalMemberStatus {
  return reply ?? "pending";
}

export function proposalMemberStatusLabel(status: ProposalMemberStatus): string {
  if (status === "hot") return "Chaud";
  if (status === "no") return "Non";
  return "En attente";
}

export function normalizeProposalReply(value: string): ProposalReplyValue {
  return value === "hot" ? "hot" : "no";
}

export function ownsProposedGame(
  games: Array<{ launcher: string; externalId: string; name: string }>,
  proposal: { launcher: string; externalId: string; name: string },
): boolean {
  const key = normalizeGameTitle(proposal.name);
  return games.some((game) => {
    if (
      game.launcher === proposal.launcher &&
      game.externalId === proposal.externalId
    ) {
      return true;
    }
    return Boolean(key) && normalizeGameTitle(game.name) === key;
  });
}
