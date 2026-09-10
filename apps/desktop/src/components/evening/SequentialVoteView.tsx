import type { Evening, VoteValue } from "../../lib/evenings";
import { metaMapKey, type GameMeta } from "../../lib/meta";
import { pad2 } from "../../lib/format";
import { GamePoster } from "../../ui/GamePoster";
import { VoteBar } from "../../ui/VoteBar";

export type SequentialVoteViewProps = {
  evening: Evening;
  meta: Map<string, GameMeta>;
  iAmParticipant: boolean;
  iOrganize: boolean;
  busy: boolean;
  onVote: (value: VoteValue) => void;
  onCancel: () => void;
};

export function SequentialVoteView(props: SequentialVoteViewProps) {
  const index = props.evening.currentCandidateIndex ?? 0;
  const candidate = props.evening.candidates[index];
  if (!candidate) return null;
  const meta = props.meta.get(
    metaMapKey(candidate.launcher, candidate.externalId),
  );

  return (
    <section className="fixed inset-0 z-40 overflow-y-auto bg-ink p-6 md:p-10">
      <div className="mx-auto grid min-h-full max-w-6xl content-start gap-6">
        <header className="flex flex-wrap items-end justify-between gap-5 border-b border-rule-strong pb-5">
          <div>
            <p className="pn-data mb-2">Phase 02 · Vote simultané</p>
            <h2 className="pn-display text-[clamp(2.5rem,6vw,5rem)]">
              Jeu {pad2(index + 1)} / {pad2(props.evening.candidates.length)}
            </h2>
          </div>
          <div className="flex items-center gap-5">
            <p className="pn-data">
              {pad2(props.evening.currentVotes)} /{" "}
              {pad2(props.evening.currentVotesTotal)} votes
            </p>
            {props.iOrganize ? (
              <button
                type="button"
                className="pn-data hover:text-paper"
                disabled={props.busy}
                onClick={props.onCancel}
              >
                Annuler
              </button>
            ) : null}
          </div>
        </header>

        <div className="grid items-center gap-8 lg:grid-cols-[minmax(260px,360px)_minmax(0,1fr)] lg:justify-center">
          <div className="mx-auto w-full max-w-[360px]">
            <GamePoster
              name={candidate.name}
              launcher={candidate.launcher}
              externalId={candidate.externalId}
              coverUrl={meta?.coverUrl}
              priority
            />
          </div>
          <div className="grid gap-5 border-t border-rule-strong pt-5 lg:border-t-0 lg:border-l lg:pl-8">
            <p className="pn-data">
              Discussion vocale · tout le monde vote le même jeu
            </p>
            {props.iAmParticipant ? (
              <>
                <VoteBar
                  value={candidate.myVote}
                  disabled={props.busy}
                  hideVeto={
                    !props.evening.myVetoAvailable &&
                    candidate.myVote !== "veto"
                  }
                  onChange={props.onVote}
                />
                <p className="pn-data">
                  {candidate.myVote
                    ? "Vote enregistré · attente des autres"
                    : "Choisis ton avis"}
                </p>
              </>
            ) : (
              <p className="pn-data border border-rule-strong px-4 py-4">
                Hors tour · {pad2(props.evening.currentVotes)} /{" "}
                {pad2(props.evening.currentVotesTotal)} votes
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
