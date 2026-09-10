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

export type ProposalApprovalRule = "unanimous" | "majority" | "count";

export type ProposalApprovalStatus = {
  rule: ProposalApprovalRule;
  targetHotCount: number;
  approved: boolean;
  rejected: boolean;
};

export function evaluateProposalApproval(input: {
  rule: ProposalApprovalRule | string | null | undefined;
  threshold?: number | null;
  memberCount: number;
  hotCount: number;
  noCount: number;
  pendingCount: number;
}): ProposalApprovalStatus {
  const rule: ProposalApprovalRule =
    input.rule === "count" || input.rule === "majority"
      ? input.rule
      : "unanimous";
  const { memberCount, hotCount, noCount, pendingCount } = input;

  if (rule === "count") {
    const target = Math.min(memberCount, Math.max(1, input.threshold ?? 3));
    const approved = hotCount >= target;
    const impossible = memberCount - noCount < target;
    const rejected =
      !approved && (impossible || (pendingCount === 0 && hotCount < target));
    return {
      rule: "count",
      targetHotCount: target,
      approved,
      rejected,
    };
  }

  if (rule === "majority") {
    const target = Math.floor(memberCount / 2) + 1;
    const approved = hotCount >= target;
    const impossible = memberCount - noCount < target;
    const rejected =
      !approved && (impossible || (pendingCount === 0 && hotCount < target));
    return {
      rule: "majority",
      targetHotCount: target,
      approved,
      rejected,
    };
  }

  // Default: unanimous
  const target = memberCount;
  const approved = pendingCount === 0 && noCount === 0 && hotCount > 0;
  const rejected = pendingCount === 0 && noCount > 0;
  return {
    rule: "unanimous",
    targetHotCount: target,
    approved,
    rejected,
  };
}
