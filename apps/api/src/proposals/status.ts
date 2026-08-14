import { normalizeGameTitle } from "../library/filter.js";

export type ProposalReplyValue = "hot" | "maybe" | "later" | "no";

export type ProposalMemberStatus =
  | "owns"
  | "hot"
  | "maybe"
  | "later"
  | "no"
  | "pending";

export function proposalMemberStatus(input: {
  owns: boolean;
  reply: ProposalReplyValue | null;
}): ProposalMemberStatus {
  if (input.owns) return "owns";
  return input.reply ?? "pending";
}

export function proposalMemberStatusLabel(status: ProposalMemberStatus): string {
  if (status === "owns") return "Possède";
  if (status === "hot") return "Chaud";
  if (status === "maybe") return "Pourquoi pas";
  if (status === "later") return "Plus tard";
  if (status === "no") return "Non";
  return "En attente";
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
