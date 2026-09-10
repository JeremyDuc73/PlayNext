import { useRef } from "react";
import type { Evening } from "../../lib/evenings";
import { metaMapKey, type GameMeta } from "../../lib/meta";
import { pad2 } from "../../lib/format";
import { formatParisShort, isEveningPast } from "../../lib/paris";
import { coverCandidates, fallbackPosterStyle } from "../../lib/covers";
import { useCoverSrc } from "../../lib/useCoverSrc";
import { gsap, prefersReducedMotion, useGSAP } from "../../lib/motion";
import { Button } from "../../ui/Button";

function ResultCover(props: {
  name: string;
  coverUrl?: string | null;
  launcher: string;
  externalId: string;
}) {
  const sources = coverCandidates({
    coverUrl: props.coverUrl,
    launcher: props.launcher,
    externalId: props.externalId,
  });
  const { src, failed, imgReady, onLoad, onError } = useCoverSrc(sources);
  const fallback = fallbackPosterStyle(props.name);
  return (
    <div
      className="absolute inset-0"
      style={!src || failed ? { background: fallback.background } : undefined}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className={
            imgReady
              ? "h-full w-full object-cover opacity-100"
              : "h-full w-full object-cover opacity-0"
          }
          onLoad={onLoad}
          onError={onError}
        />
      ) : null}
      {!src || failed ? (
        <div className="flex h-full items-center justify-center pn-display text-6xl text-smoke-dim">
          {fallback.initial}
        </div>
      ) : null}
    </div>
  );
}

export type ResultViewProps = {
  evening: Evening;
  winner: Evening["candidates"][number];
  meta: Map<string, GameMeta>;
  iOrganize: boolean;
  busy: boolean;
  onBack?: () => void;
  onConfirm: () => void;
  onRoulette: () => void;
  onRevoteTie: () => void;
  onNewRound: () => void;
  onCancel: () => void;
};

export function ResultView(props: ResultViewProps) {
  const coverRef = useRef<HTMLDivElement>(null);
  const m = props.meta.get(
    metaMapKey(props.winner.launcher, props.winner.externalId),
  );
  const direct = props.evening.kind === "direct";
  const coming = props.evening.participants.filter((p) => p.ready).length;

  useGSAP(
    () => {
      if (prefersReducedMotion() || !coverRef.current) return;
      gsap.from(coverRef.current, {
        opacity: 0,
        x: -24,
        duration: 0.42,
        ease: "power3.out",
      });
    },
    { dependencies: [props.winner.id] },
  );

  return (
    <div className="grid min-h-[70vh] border border-rule-strong lg:grid-cols-[0.9fr_1.1fr]">
      <div ref={coverRef} className="flex min-h-[320px] flex-col bg-ink-deep p-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <span className="pn-stamp self-start">
            {formatParisShort(props.evening.scheduledAt)}
          </span>
          {props.evening.status === "closed" ? (
            <span className="pn-stamp border-paper text-paper bg-transparent">
              {isEveningPast(props.evening.scheduledAt, props.evening.createdAt)
                ? "TERMINÉE"
                : "SOIRÉE CONFIRMÉE"}
            </span>
          ) : null}
        </div>
        <div className="relative mx-auto w-full max-w-[420px] aspect-[3/4] bg-ink">
          <ResultCover
            name={props.winner.name}
            coverUrl={m?.coverUrl}
            launcher={props.winner.launcher}
            externalId={props.winner.externalId}
          />
        </div>
        <div className="mt-3 border-t border-rule pt-3">
          <p className="pn-data">Résultat</p>
          <p className="pn-display mt-2 text-3xl">{props.winner.name}</p>
        </div>
      </div>
      <div className="flex flex-col p-6 md:p-10">
        <p className="pn-data mb-6">
          {direct
            ? `Je viens · ${pad2(coming)} / ${pad2(props.evening.participants.length)}`
            : `Bulletins déposés · ${pad2(props.evening.participants.length)} / ${pad2(props.evening.participants.length)}`}
        </p>
        {direct ? (
          <ul className="mt-8 m-0 list-none border-t border-rule p-0">
            {props.evening.participants
              .filter((person) => person.present)
              .map((person) => (
                <li
                  key={person.id}
                  className="flex justify-between border-b border-rule py-3 font-data text-xs tracking-[0.14em] uppercase"
                >
                  <span className="text-smoke">{person.displayName}</span>
                  <span className="text-paper">
                    {person.ready ? "Je viens" : "—"}
                  </span>
                </li>
              ))}
          </ul>
        ) : (
          <ul className="mt-8 m-0 list-none border-t border-rule p-0">
            {(
              [
                ["Chaud", props.winner.tally?.hot ?? 0],
                ["Pourquoi pas", props.winner.tally?.maybe ?? 0],
                ["Pass", props.winner.tally?.pass ?? 0],
                ["Veto", props.winner.tally?.veto ?? 0],
              ] as const
            ).map(([label, n]) => (
              <li
                key={label}
                className="flex justify-between border-b border-rule py-3 font-data text-xs tracking-[0.14em] uppercase"
              >
                <span className={label === "Veto" && n > 0 ? "text-veto" : "text-smoke"}>
                  {label}
                </span>
                <span className={label === "Veto" && n > 0 ? "text-veto" : "text-paper"}>
                  {pad2(n)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-4 pt-10">
          {props.onBack ? (
            <Button variant="second" onClick={props.onBack}>
              ← Liste
            </Button>
          ) : null}

          {props.evening.status === "closed" ? (
            <span className="pn-data font-bold text-paper">
              {isEveningPast(props.evening.scheduledAt, props.evening.createdAt)
                ? "Soirée archivée"
                : "Choix validé · Soirée confirmée"}
            </span>
          ) : props.iOrganize ? (
            <>
              <Button variant="primary" disabled={props.busy} onClick={props.onConfirm}>
                Confirmer
              </Button>
              {direct ? null : (
                <Button variant="ghost" disabled={props.busy} onClick={props.onNewRound}>
                  Relancer un tour
                </Button>
              )}
              {direct || (props.evening.resolution?.tiedIds?.length ?? 0) < 2 ? null : (
                <>
                  <Button
                    variant="ghost"
                    disabled={props.busy}
                    onClick={props.onRevoteTie}
                  >
                    Revoter l’égalité
                  </Button>
                  <button
                    type="button"
                    className="pn-data hover:text-paper"
                    disabled={props.busy}
                    onClick={props.onRoulette}
                  >
                    Tirage
                  </button>
                </>
              )}
            </>
          ) : (
            <p className="pn-data">En attente de l’organisateur</p>
          )}

          {props.iOrganize && props.evening.status !== "closed" ? (
            <button
              type="button"
              className="pn-data hover:text-paper"
              disabled={props.busy}
              onClick={props.onCancel}
            >
              Annuler
            </button>
          ) : props.iOrganize ? (
            <button
              type="button"
              className="pn-data text-smoke hover:text-veto ml-auto"
              disabled={props.busy}
              onClick={props.onCancel}
            >
              Annuler la soirée
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
