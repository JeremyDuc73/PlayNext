import { useState } from "react";
import type { Evening } from "../../lib/evenings";
import { metaMapKey, type GameMeta } from "../../lib/meta";
import { pad2 } from "../../lib/format";
import { Button } from "../../ui/Button";
import { GamePoster } from "../../ui/GamePoster";
import { PresenceStrip } from "../../ui/PresenceRow";

export type SelectionViewProps = {
  evening: Evening;
  meta: Map<string, GameMeta>;
  selectionIds: string[];
  selectionSubmitted: boolean;
  iAmParticipant: boolean;
  iOrganize: boolean;
  busy: boolean;
  onToggle: (candidateId: string) => void;
  onSubmit: () => void;
  onStart: () => void;
  onCancel: () => void;
};

export function SelectionView(props: SelectionViewProps) {
  const selectedCount = props.selectionIds.length;
  const [scope, setScope] = useState<"all" | "common" | "not-common">("all");
  const [query, setQuery] = useState("");
  const visibleCandidates = props.evening.candidates.filter((candidate) => {
    if (!candidate.ownedByMe) return false;
    if (
      query.trim() &&
      !candidate.name.toLowerCase().includes(query.trim().toLowerCase())
    ) {
      return false;
    }
    if (scope === "common") {
      return candidate.ownedCount === candidate.participantCount;
    }
    if (scope === "not-common") {
      return candidate.ownedCount < candidate.participantCount;
    }
    return true;
  });
  const selectedCandidates = props.selectionIds
    .map((id) => props.evening.candidates.find((candidate) => candidate.id === id))
    .filter(
      (candidate): candidate is Evening["candidates"][number] =>
        candidate != null,
    );

  return (
    <section className="fixed inset-0 z-40 flex flex-col bg-ink">
      <div className="min-h-0 flex-1 overflow-y-auto p-6 md:p-10">
        <div className="mx-auto grid max-w-7xl content-start gap-6">
          <header className="flex flex-wrap items-end justify-between gap-5 border-b border-rule-strong pb-5">
            <div>
              <p className="pn-data mb-2">Phase 01 · Sélection</p>
              <h2 className="pn-display text-[clamp(2.5rem,6vw,5rem)]">
                Choisis tes jeux
              </h2>
              <p className="pn-data mt-2">
                {pad2(selectedCount)} / {pad2(props.evening.shortlistSize)} max
              </p>
            </div>
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
          </header>

          <section className="border-2 border-paper bg-ink-deep p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule pb-3">
              <p className="pn-data text-paper">Ta sélection</p>
              <p className="pn-data">
                {pad2(selectedCandidates.length)} /{" "}
                {pad2(props.evening.shortlistSize)}
              </p>
            </div>
            {selectedCandidates.length > 0 ? (
              <ol className="m-0 grid list-none gap-0 p-0 sm:grid-cols-2">
                {selectedCandidates.map((candidate, index) => {
                  const missing =
                    candidate.participantCount - candidate.ownedCount;
                  return (
                    <li key={candidate.id} className="border-b border-rule">
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 px-2 py-3 text-left hover:bg-ink-raise"
                        onClick={() => props.onToggle(candidate.id)}
                      >
                        <span className="pn-stamp shrink-0">
                          {pad2(index + 1)}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-ui text-xs font-bold uppercase tracking-[0.08em] text-paper">
                          {candidate.name}
                        </span>
                        <span className="pn-data shrink-0">
                          Retirer
                        </span>
                        {missing > 0 ? (
                          <span className="pn-data shrink-0">
                            -{pad2(missing)}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="pn-data pt-4">Aucun jeu choisi</p>
            )}
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <input
              className="min-w-[220px] flex-1 border border-rule-strong bg-ink-deep px-3 py-3 font-data text-xs tracking-[0.1em] uppercase outline-none focus:border-veto"
              placeholder="Rechercher…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="flex flex-wrap border border-rule-strong">
              {(
                [
                  ["all", "Ma bibliothèque"],
                  ["common", "En commun"],
                  ["not-common", "Pas en commun"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={scope === value}
                  className={
                    scope === value
                      ? "border-r border-paper bg-paper px-4 py-3 font-ui text-xs font-bold uppercase tracking-[0.12em] text-ink-deep"
                      : "border-r border-rule-strong px-4 py-3 font-ui text-xs font-bold uppercase tracking-[0.12em] text-smoke last:border-r-0"
                  }
                  onClick={() => setScope(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {visibleCandidates.length === 0 ? (
            <p className="border border-rule-strong p-5 pn-data">
              Aucun jeu dans ce filtre.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {visibleCandidates.map((candidate, index) => {
                const meta = props.meta.get(
                  metaMapKey(candidate.launcher, candidate.externalId),
                );
                const missing = candidate.participantCount - candidate.ownedCount;
                return (
                  <div key={candidate.id} data-ticket>
                    <GamePoster
                      name={candidate.name}
                      launcher={candidate.launcher}
                      externalId={candidate.externalId}
                      coverUrl={meta?.coverUrl}
                      index={pad2(index + 1)}
                      selected={props.selectionIds.includes(candidate.id)}
                      subtitle={
                        missing > 0
                          ? `Manque ${pad2(missing)} joueur${missing > 1 ? "s" : ""}`
                          : "En commun"
                      }
                      onClick={
                        props.iAmParticipant ? () => props.onToggle(candidate.id) : undefined
                      }
                      priority={index < 24}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <footer className="shrink-0 border-t border-paper bg-ink px-6 py-3 md:px-10">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <PresenceStrip
            people={props.evening.participants
              .filter((p) => p.present)
              .map((p) => ({
                id: p.id,
                displayName: p.displayName,
                avatarUrl: p.avatarUrl,
                ready: p.selectionSubmitted,
              }))}
          />
          <div className="flex flex-wrap items-center gap-3">
            {props.iAmParticipant ? (
              <Button
                variant="primary"
                disabled={props.busy || selectedCount < 1}
                onClick={props.onSubmit}
              >
                {props.selectionSubmitted
                  ? "Mettre à jour"
                  : "Valider ma sélection"}
              </Button>
            ) : (
              <p className="pn-data">Hors tour</p>
            )}
            {props.iOrganize && props.evening.selectionComplete ? (
              <Button
                variant="ghost"
                disabled={props.busy}
                onClick={props.onStart}
              >
                Lancer les votes
              </Button>
            ) : null}
          </div>
        </div>
      </footer>
    </section>
  );
}
