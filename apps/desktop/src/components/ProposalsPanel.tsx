import { pad2 } from "../lib/format";
import {
  proposalStatusLabel,
  type GameProposal,
  type ProposalReplyValue,
} from "../lib/proposals";
import { openExternalUrl } from "../lib/desktop-auth";
import { Button } from "../ui/Button";
import { GamePoster } from "../ui/GamePoster";
import { ProposalBallot } from "../ui/ProposalBallot";
import { SquareAvatar } from "../ui/SquareAvatar";

type Props = {
  proposals: GameProposal[];
  busy: boolean;
  onReply: (proposalId: string, value: ProposalReplyValue) => void;
  onClose: (proposalId: string) => void;
  onCreateEvening: (proposal: GameProposal) => void;
};

export function ProposalsPanel({
  proposals,
  busy,
  onReply,
  onClose,
  onCreateEvening,
}: Props) {
  if (proposals.length === 0) return null;

  return (
    <section className="grid gap-4">
      <div>
        <p className="pn-data mb-2">Steam</p>
        <h3 className="pn-display text-2xl">Propositions</h3>
        <span className="pn-accent mt-3" />
      </div>
      <ul className="m-0 grid list-none gap-4 p-0">
        {proposals.map((proposal) => {
          const missing = proposal.members.filter((member) => !member.owns);
          return (
            <li key={proposal.id} className="border border-rule-strong">
              <div className="grid gap-4 p-4 md:grid-cols-[92px_minmax(0,1fr)]">
                <GamePoster
                  name={proposal.name}
                  launcher={proposal.launcher}
                  externalId={proposal.externalId}
                  coverUrl={proposal.coverUrl}
                  subtitle="Steam"
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-ui text-sm font-bold uppercase tracking-[0.08em]">
                        {proposal.name}
                      </p>
                      <p className="pn-data mt-1">
                        {proposal.priceLabel ?? "—"}
                        {" · "}
                        {pad2(proposal.ownedCount)} / {pad2(proposal.memberCount)}{" "}
                        possèdent
                        {" · "}
                        {pad2(proposal.pendingCount)} en attente
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="second"
                        onClick={() => void openExternalUrl(proposal.steamUrl)}
                      >
                        Store Steam
                      </Button>
                      {proposal.canCreateEvening ? (
                        <Button
                          variant="primary"
                          disabled={busy}
                          onClick={() => onCreateEvening(proposal)}
                        >
                          Créer une soirée
                        </Button>
                      ) : null}
                      {proposal.canClose ? (
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() => onClose(proposal.id)}
                        >
                          Annuler
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <p className="pn-data mt-3">
                    Sans le jeu
                    {missing.length === 0
                      ? " · —"
                      : ` · ${missing.map((member) => member.displayName).join(" · ")}`}
                  </p>
                  <ul className="m-0 mt-3 list-none p-0">
                    {proposal.members.map((member, index) => (
                      <li key={member.userId} className="pn-ledger-row">
                        <span className="font-data text-[10px] tracking-[0.12em] text-smoke-dim">
                          {pad2(index + 1)}
                        </span>
                        <SquareAvatar
                          name={member.displayName}
                          avatarUrl={member.avatarUrl}
                          tone={member.status === "hot" ? "active" : "idle"}
                        />
                        <span className="truncate font-ui text-sm text-paper">
                          {member.displayName}
                        </span>
                        <span className="font-data text-[10px] tracking-[0.12em] text-smoke uppercase">
                          {proposalStatusLabel(member.status)}
                          {member.owns ? " · Possède" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {proposal.canReply ? (
                    <div className="mt-4">
                      <ProposalBallot
                        value={proposal.myReply}
                        disabled={busy}
                        onChange={(value) => onReply(proposal.id, value)}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
