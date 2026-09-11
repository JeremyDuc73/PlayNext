import { useEffect, useMemo, useRef, useState } from "react";
import type { Evening, EveningCandidate } from "../../lib/evenings";
import { metaMapKey, type GameMeta } from "../../lib/meta";
import { pad2 } from "../../lib/format";
import { formatParisShort, isEveningPast } from "../../lib/paris";
import { coverCandidates, fallbackPosterStyle } from "../../lib/covers";
import { useCoverSrc } from "../../lib/useCoverSrc";
import { gsap, prefersReducedMotion, useGSAP } from "../../lib/motion";
import { Button } from "../../ui/Button";

const EASE_SLIDE = "cubic-bezier(0.16, 1, 0.3, 1)";
const REEL_COPIES = 10;

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

function TallyList(props: { tally: NonNullable<EveningCandidate["tally"]> }) {
  return (
    <ul className="m-0 list-none border-t border-rule p-0">
      {(
        [
          ["Chaud", props.tally.hot],
          ["Pourquoi pas", props.tally.maybe],
          ["Pass", props.tally.pass],
          ["Veto", props.tally.veto],
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
  );
}

export type ResultViewProps = {
  evening: Evening;
  winner?: EveningCandidate;
  meta: Map<string, GameMeta>;
  iOrganize: boolean;
  busy: boolean;
  onBack?: () => void;
  onConfirm: () => void;
  onRoulette: () => Promise<unknown>;
  onRevoteTie: () => void;
  onCancel: () => void;
};

export function ResultView(props: ResultViewProps) {
  const coverRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const reelRef = useRef<HTMLDivElement>(null);
  const loopTween = useRef<gsap.core.Tween | null>(null);
  const shownWinnerId = useRef(props.winner?.id ?? null);
  const [spinning, setSpinning] = useState(false);

  const tied = useMemo(() => {
    const ids = props.evening.resolution?.tiedIds ?? [];
    return ids
      .map((id) => props.evening.candidates.find((c) => c.id === id))
      .filter((c): c is EveningCandidate => Boolean(c));
  }, [props.evening.candidates, props.evening.resolution?.tiedIds]);

  const reelItems = useMemo(
    () => Array.from({ length: REEL_COPIES }, () => tied).flat(),
    [tied],
  );

  const tiedKey = tied.map((c) => c.id).join(",");
  const winner = props.winner;
  const direct = props.evening.kind === "direct";
  const coming = props.evening.participants.filter((p) => p.ready).length;
  const unresolvedTie = !direct && tied.length >= 2 && !winner;
  const canDraw =
    !direct &&
    tied.length >= 2 &&
    props.evening.status !== "closed" &&
    props.iOrganize;
  const winnerMeta = winner
    ? props.meta.get(metaMapKey(winner.launcher, winner.externalId))
    : undefined;

  useEffect(() => {
    const id = winner?.id ?? null;
    if (!id) {
      shownWinnerId.current = null;
      return;
    }
    if (
      !direct &&
      tied.length >= 2 &&
      id !== shownWinnerId.current &&
      !spinning
    ) {
      setSpinning(true);
    }
  }, [direct, spinning, tied.length, winner?.id]);

  useGSAP(
    () => {
      if (spinning || prefersReducedMotion() || !coverRef.current) return;
      gsap.from(coverRef.current, {
        opacity: 0,
        x: -24,
        duration: 0.42,
        ease: EASE_SLIDE,
      });
    },
    { dependencies: [winner?.id, unresolvedTie] },
  );

  useGSAP(
    () => {
      if (!spinning || !reelRef.current || !viewportRef.current) return;
      if (tied.length < 2) return;

      const itemH = viewportRef.current.getBoundingClientRect().height;
      const cycle = itemH * tied.length;
      if (cycle <= 0) return;

      loopTween.current?.kill();
      gsap.set(reelRef.current, { y: 0 });

      if (prefersReducedMotion()) {
        if (winner) {
          const index = Math.max(
            0,
            tied.findIndex((c) => c.id === winner.id),
          );
          gsap.set(reelRef.current, { y: -index * itemH });
          shownWinnerId.current = winner.id;
          setSpinning(false);
        }
        return;
      }

      loopTween.current = gsap.to(reelRef.current, {
        y: -cycle,
        duration: Math.max(0.36, 0.2 * tied.length),
        ease: "none",
        repeat: -1,
      });

      return () => {
        loopTween.current?.kill();
        loopTween.current = null;
      };
    },
    { dependencies: [spinning, tiedKey] },
  );

  useGSAP(
    () => {
      if (!spinning || !winner || !reelRef.current || !viewportRef.current) {
        return;
      }
      if (tied.length < 2) return;
      if (prefersReducedMotion()) {
        const index = Math.max(
          0,
          tied.findIndex((c) => c.id === winner.id),
        );
        const height = viewportRef.current.getBoundingClientRect().height;
        gsap.set(reelRef.current, { y: -index * height });
        shownWinnerId.current = winner.id;
        setSpinning(false);
        return;
      }

      const winnerIndex = Math.max(
        0,
        tied.findIndex((c) => c.id === winner.id),
      );
      const delay = gsap.delayedCall(0.8, () => {
        const reel = reelRef.current;
        const viewport = viewportRef.current;
        if (!reel || !viewport) return;
        const height = viewport.getBoundingClientRect().height;
        if (height <= 0) return;
        const currentY = Number(gsap.getProperty(reel, "y")) || 0;
        const extra = 4 * tied.length + winnerIndex;
        let slot = Math.ceil(-currentY / height) + extra;
        while (slot % tied.length !== winnerIndex) slot += 1;
        loopTween.current?.kill();
        loopTween.current = null;
        gsap.to(reel, {
          y: -slot * height,
          duration: 2.2,
          ease: EASE_SLIDE,
          onComplete: () => {
            shownWinnerId.current = winner.id;
            setSpinning(false);
          },
        });
      });

      return () => {
        delay.kill();
      };
    },
    { dependencies: [spinning, winner?.id, tiedKey] },
  );

  function onDraw() {
    if (spinning || props.busy) return;
    setSpinning(true);
    void props.onRoulette().catch(() => {
      setSpinning(false);
    });
  }

  const caption = spinning
    ? "Tirage"
    : unresolvedTie
      ? `Égalité · ${pad2(tied.length)} jeux`
      : winner
        ? "Le grand gagnant !"
        : props.evening.resolution?.allEliminated
          ? "Aucun jeu retenu"
          : "Résultat";

  const locked = Boolean(winner) && !spinning && !unresolvedTie;

  return (
    <div className="grid min-h-[70vh] border border-rule-strong lg:grid-cols-[0.9fr_1.1fr]">
      <div ref={coverRef} className="flex min-h-[320px] flex-col bg-ink-deep p-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <span className="pn-stamp self-start">
            {formatParisShort(props.evening.scheduledAt)}
          </span>
          {props.evening.status === "closed" ? (
            <span className="pn-stamp border-paper bg-transparent text-paper">
              {isEveningPast(props.evening.scheduledAt, props.evening.createdAt)
                ? "TERMINÉE"
                : "SOIRÉE CONFIRMÉE"}
            </span>
          ) : null}
        </div>
        {spinning && tied.length >= 2 ? (
          <div
            ref={viewportRef}
            className="relative mx-auto w-full max-w-[420px] aspect-[3/4] overflow-hidden bg-ink"
            style={{ outline: "2px solid var(--color-paper)", outlineOffset: "-2px" }}
          >
            <div ref={reelRef} className="absolute inset-x-0 top-0 w-full">
              {reelItems.map((game, index) => {
                const meta = props.meta.get(
                  metaMapKey(game.launcher, game.externalId),
                );
                return (
                  <div key={`${game.id}-${index}`} className="relative aspect-[3/4] w-full">
                    <ResultCover
                      name={game.name}
                      coverUrl={meta?.coverUrl}
                      launcher={game.launcher}
                      externalId={game.externalId}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ) : unresolvedTie ? (
          <div className="mx-auto grid w-full max-w-[420px] grid-cols-2 gap-px bg-rule">
            {tied.map((game) => {
              const meta = props.meta.get(
                metaMapKey(game.launcher, game.externalId),
              );
              return (
                <div key={game.id} className="bg-ink-deep">
                  <div className="relative aspect-[3/4] w-full">
                    <ResultCover
                      name={game.name}
                      coverUrl={meta?.coverUrl}
                      launcher={game.launcher}
                      externalId={game.externalId}
                    />
                  </div>
                  <p className="border-t border-rule px-2 py-2 pn-display text-sm">
                    {game.name}
                  </p>
                </div>
              );
            })}
          </div>
        ) : winner ? (
          <div
            className="relative mx-auto w-full max-w-[420px] aspect-[3/4] bg-ink"
            style={
              locked
                ? { outline: "4px solid var(--color-paper)", outlineOffset: "-4px" }
                : undefined
            }
          >
            <ResultCover
              name={winner.name}
              coverUrl={winnerMeta?.coverUrl}
              launcher={winner.launcher}
              externalId={winner.externalId}
            />
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-[420px] aspect-[3/4] items-center justify-center border border-rule bg-ink">
            <p className="pn-data">Aucun jeu</p>
          </div>
        )}
        <div className="mt-3 border-t border-rule pt-3">
          <p className="pn-data">{caption}</p>
          <p className="pn-display mt-2 text-3xl">
            {unresolvedTie || spinning
              ? tied.map((game) => game.name).join(" · ")
              : (winner?.name ?? "—")}
          </p>
        </div>
      </div>
      <div className="flex flex-col p-6 md:p-10">
        <p className="pn-data mb-6">
          {direct
            ? `Présents · ${pad2(coming)} / ${pad2(props.evening.participants.length)}`
            : unresolvedTie || spinning
              ? `Égalité · ${pad2(tied.length)} jeux`
              : `Tous les votes sont tombés ! · ${pad2(props.evening.participants.length)} / ${pad2(props.evening.participants.length)}`}
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
        ) : unresolvedTie || (spinning && tied.length >= 2) ? (
          <div className="mt-8 grid gap-8">
            {tied.map((game) => (
              <div key={game.id}>
                <p className="pn-display mb-3 text-xl">{game.name}</p>
                {game.tally ? <TallyList tally={game.tally} /> : null}
              </div>
            ))}
          </div>
        ) : winner?.tally ? (
          <div className="mt-8">
            <TallyList tally={winner.tally} />
          </div>
        ) : null}
        <div className="mt-auto flex flex-col gap-4 pt-10">
          <div className="flex flex-wrap items-center gap-4">
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
              winner && !unresolvedTie && !spinning ? (
                <Button
                  variant="primary"
                  disabled={props.busy}
                  onClick={props.onConfirm}
                >
                  Confirmer
                </Button>
              ) : null
            ) : (
              <p className="pn-data">
                {unresolvedTie
                  ? "Égalité · en attente de l’organisateur"
                  : "En attente de l’organisateur"}
              </p>
            )}

            {props.iOrganize && props.evening.status !== "closed" ? (
              <button
                type="button"
                className="pn-data hover:text-paper"
                disabled={props.busy || spinning}
                onClick={props.onCancel}
              >
                Annuler
              </button>
            ) : props.iOrganize ? (
              <button
                type="button"
                className="pn-data ml-auto text-smoke hover:text-veto"
                disabled={props.busy}
                onClick={props.onCancel}
              >
                Annuler la soirée
              </button>
            ) : null}
          </div>

          {canDraw ? (
            <div className="flex w-full max-w-xl gap-3">
              <Button
                variant="second"
                className="min-w-0 flex-1"
                disabled={props.busy || spinning}
                onClick={props.onRevoteTie}
              >
                Revoter l’égalité
              </Button>
              <Button
                variant={winner && !spinning ? "second" : "primary"}
                className="min-w-0 flex-1"
                disabled={props.busy || spinning}
                onClick={onDraw}
              >
                Tirage
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
