import { useRef } from "react";
import { type Evening, vibeLabel } from "../../lib/evenings";
import { formatParisWhen } from "../../lib/paris";
import { stampIn, useGSAP } from "../../lib/motion";
import { Button } from "../../ui/Button";
import { GamePoster } from "../../ui/GamePoster";
import { PresenceRow } from "../../ui/PresenceRow";

export type LobbyViewProps = {
  evening: Evening;
  groupName: string;
  currentUserId: string;
  iAmParticipant: boolean;
  iOrganize: boolean;
  busy: boolean;
  onReady: () => void;
  onSkipUnready: () => void;
  onConfirmDirect?: () => void;
  onBack: () => void;
  onCancel: () => void;
};

export function LobbyView(props: LobbyViewProps) {
  const stampRef = useRef<HTMLSpanElement>(null);
  const present = props.evening.participants.filter((p) => p.present);
  const me = present.find((p) => p.id === props.currentUserId);
  const myReady = Boolean(me?.ready);
  const waiting = present.some((p) => !p.ready);
  const direct = props.evening.kind === "direct";
  const locked = props.evening.candidates[0];
  const duration =
    props.evening.durationMinutes == null
      ? "Sans limite"
      : `${props.evening.durationMinutes} min`;
  const whenLabel = formatParisWhen(props.evening.scheduledAt);

  useGSAP(
    () => {
      stampIn(stampRef.current);
    },
    { dependencies: [myReady] },
  );

  return (
    <section className="fixed inset-0 z-40 flex flex-col bg-ink">
      <div className="min-h-0 flex-1 overflow-y-auto p-6 md:p-10">
        <div className="mx-auto grid max-w-3xl content-start gap-8">
          <header className="flex flex-wrap items-end justify-between gap-5 border-b border-rule-strong pb-5">
            <div>
              <p className="pn-data mb-2">Lobby · En attente des joueurs</p>
              <h2 className="pn-display text-[clamp(2.5rem,6vw,5rem)]">Lobby</h2>
              <p className="pn-data mt-3">
                {props.groupName}
                {" · "}
                {whenLabel}
                {direct ? null : ` · ${vibeLabel(props.evening.vibe)} · ${duration}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                className="pn-data hover:text-paper"
                disabled={props.busy}
                onClick={props.onBack}
              >
                Liste
              </button>
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

          {direct && locked ? (
            <div className="max-w-[180px]">
              <GamePoster
                name={locked.name}
                launcher={locked.launcher}
                externalId={locked.externalId}
                subtitle={locked.name}
              />
            </div>
          ) : null}

          <PresenceRow
            people={present.map((p) => ({
              id: p.id,
              displayName: p.displayName,
              avatarUrl: p.avatarUrl,
              ready: p.ready,
            }))}
            readyLabel={direct ? "Je viens" : "Prêt"}
          />

          <div className="pn-sync w-full" aria-hidden>
            <i />
          </div>
        </div>
      </div>

      <footer className="shrink-0 border-t border-paper bg-ink px-6 py-3 md:px-10">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4">
          <p className="pn-data">
            {props.iAmParticipant
              ? myReady
                ? "T'es prêt ! En attente des potes..."
                : "Confirme que tu es là pour participer"
              : "Spectateur"}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {props.iAmParticipant && myReady ? (
              <span ref={stampRef} className="pn-stamp">
                {direct ? "Je viens" : "Prêt"}
              </span>
            ) : null}
            {props.iAmParticipant && !myReady ? (
              <Button
                variant="primary"
                disabled={props.busy}
                onClick={props.onReady}
              >
                {direct ? "Je viens" : "Je suis prêt"}
              </Button>
            ) : null}
            {direct && props.iOrganize && !waiting ? (
              <Button
                variant="primary"
                disabled={props.busy}
                onClick={props.onConfirmDirect}
              >
                Confirmer
              </Button>
            ) : null}
            {props.iOrganize && waiting ? (
              <Button
                variant="second"
                disabled={props.busy}
                onClick={props.onSkipUnready}
              >
                {direct ? "Lancer sans eux" : "Lancer sans eux"}
              </Button>
            ) : null}
          </div>
        </div>
      </footer>
    </section>
  );
}
