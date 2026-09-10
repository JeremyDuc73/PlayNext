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
    <ul className="m-0 grid list-none gap-4 p-0">
      {proposals.map((proposal) => {
        const hotCount =
          proposal.hotCount ??
          proposal.members.filter((m) => m.status === "hot").length;
        const noCount =
          proposal.noCount ??
          proposal.members.filter((m) => m.status === "no").length;

        return (
          <li key={proposal.id} className="border border-rule-strong bg-ink">
            <div className="grid gap-4 p-4 sm:grid-cols-[100px_minmax(0,1fr)]">
              <GamePoster
                name={proposal.name}
                launcher={proposal.launcher}
                externalId={proposal.externalId}
                coverUrl={proposal.coverUrl}
                subtitle="Steam"
              />
              <div className="min-w-0 flex flex-col justify-between gap-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-ui text-base font-bold uppercase tracking-[0.08em] text-paper">
                        {proposal.name}
                      </h4>
                      <button
                        type="button"
                        className="pn-data text-smoke hover:text-paper"
                        onClick={() => void openExternalUrl(proposal.steamUrl)}
                      >
                        Store ↗
                      </button>
                    </div>
                    <p className="pn-data mt-1">
                      {proposal.priceLabel ?? "Steam"}
                      {" · "}
                      {pad2(proposal.ownedCount)} / {pad2(proposal.memberCount)}{" "}
                      possèdent
                      {" · "}
                      <span className="text-paper">{pad2(hotCount)} Chaud</span>
                      {" · "}
                      <span className={noCount > 0 ? "text-veto" : "text-smoke"}>
                        {pad2(noCount)} Non
                      </span>
                      {proposal.pendingCount > 0 ? (
                        <> · {pad2(proposal.pendingCount)} en attente</>
                      ) : null}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {proposal.canCreateEvening ? (
                      <Button
                        variant="primary"
                        disabled={busy}
                        onClick={() => onCreateEvening(proposal)}
                      >
                        Créer une soirée
                      </Button>
                    ) : proposal.approved ? (
                      <span className="pn-stamp">Validé</span>
                    ) : proposal.rejected ? (
                      <span className="pn-data text-veto">Non retenu</span>
                    ) : null}

                    {proposal.canClose ? (
                      <button
                        type="button"
                        className="pn-data text-smoke hover:text-veto"
                        disabled={busy}
                        onClick={() => onClose(proposal.id)}
                      >
                        Annuler
                      </button>
                    ) : null}
                  </div>
                </div>

                <ul className="m-0 list-none border-t border-rule pt-2 p-0">
                  {proposal.members.map((member, index) => (
                    <li key={member.userId} className="pn-ledger-row py-1.5">
                      <span className="font-data text-[10px] tracking-[0.12em] text-smoke-dim">
                        {pad2(index + 1)}
                      </span>
                      <SquareAvatar
                        name={member.displayName}
                        avatarUrl={member.avatarUrl}
                        tone={member.status === "hot" ? "active" : "idle"}
                      />
                      <span className="truncate font-ui text-xs font-bold uppercase tracking-[0.08em] text-paper">
                        {member.displayName}
                      </span>
                      <span className="font-data text-[10px] tracking-[0.12em] uppercase">
                        <span
                          className={
                            member.status === "hot"
                              ? "text-paper"
                              : member.status === "no"
                                ? "text-veto"
                                : "text-smoke-dim"
                          }
                        >
                          {proposalStatusLabel(member.status)}
                        </span>
                        {member.owns ? (
                          <span className="text-smoke"> · Possède</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>

                {proposal.canReply ? (
                  <div className="mt-1 pt-2 border-t border-rule">
                    <p className="pn-data mb-2">Ton avis</p>
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
  );
}
