import { useEffect, useRef, useState } from "react";
import {
  cancelEvening,
  closeEvening,
  createEvening,
  clearEveningHistory,
  deleteEvening,
  eveningDisplayTitle,
  fetchEvening,
  isLiveEveningStatus,
  listEvenings,
  markEveningReady,
  newEveningRound,
  openEveningSelection,
  revoteTie,
  rouletteEvening,
  startVoting,
  submitCurrentVote,
  submitSelection,
  vibeLabel,
  type DirectEveningDraft,
  type Evening,
  type EveningSummary,
  type EveningVibe,
  type VoteValue,
} from "../lib/evenings";
import type { GroupMember } from "../lib/groups";
import { pad2 } from "../lib/format";
import {
  defaultEveningWhen,
  eveningWhenToIso,
  formatParisWhen,
  formatParisShort,
  type EveningWhenValue,
} from "../lib/paris";
import type { SteamCatalogHit } from "../lib/steam";
import { metaMapKey, resolveGameMeta, type GameMeta } from "../lib/meta";
import { gsap, prefersReducedMotion, staggerIn, stampIn, useGSAP } from "../lib/motion";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { EmptyHint } from "../ui/EmptyHint";
import { coverCandidates, fallbackPosterStyle } from "../lib/covers";
import { useCoverSrc } from "../lib/useCoverSrc";
import { GamePoster } from "../ui/GamePoster";
import { PresenceRow, PresenceStrip } from "../ui/PresenceRow";
import { VoteBar } from "../ui/VoteBar";
import { EveningWhenField } from "../ui/EveningWhen";
import { SteamSearch } from "../ui/SteamSearch";

type Props = {
  groupId: string;
  groupName: string;
  currentUserId: string;
  members: GroupMember[];
  canOrganize: boolean;
  isOwner: boolean;
  onBanner: (message: string) => void;
  directDraft?: DirectEveningDraft | null;
  onDirectDraftConsumed?: () => void;
};

const VIBES: { value: EveningVibe; label: string }[] = [
  { value: "any", label: "Libre" },
  { value: "chill", label: "Détente" },
  { value: "competitive", label: "Compétitif" },
  { value: "campaign", label: "Campagne" },
  { value: "party", label: "Groupe" },
];

export function EveningPanel({
  groupId,
  groupName,
  currentUserId,
  members,
  canOrganize,
  isOwner,
  onBanner,
  directDraft = null,
  onDirectDraftConsumed,
}: Props) {
  const [history, setHistory] = useState<EveningSummary[]>([]);
  const [evening, setEvening] = useState<Evening | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [durationMinutes, setDurationMinutes] = useState<number | null>(90);
  const [vibe, setVibe] = useState<EveningVibe>("any");
  const [requireInstalled, setRequireInstalled] = useState(false);
  const [shortlistSize, setShortlistSize] = useState(3);
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>(
    () => members.map((m) => m.id),
  );
  const [selectionIds, setSelectionIds] = useState<string[]>([]);
  const [meta, setMeta] = useState<Map<string, GameMeta>>(new Map());
  const [setupMode, setSetupMode] = useState<null | "ritual" | "direct">(null);
  const [when, setWhen] = useState<EveningWhenValue>(defaultEveningWhen);
  const [directGame, setDirectGame] = useState<DirectEveningDraft | null>(null);
  const [skipUnreadyOpen, setSkipUnreadyOpen] = useState(false);
  const [historyConfirm, setHistoryConfirm] = useState<"all" | string | null>(
    null,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const eveningRef = useRef<Evening | null>(null);
  const selectionDirtyRef = useRef(false);
  const metaLoadedForRef = useRef<string | null>(null);

  function applyEvening(next: Evening): void {
    const previous = eveningRef.current;
    const sameRound =
      previous?.id === next.id && previous.round === next.round;

    if (!sameRound) {
      selectionDirtyRef.current = false;
    }

    eveningRef.current = next;
    const participant = next.participants.find(
      (item) => item.id === currentUserId,
    );
    if (!sameRound || !selectionDirtyRef.current) {
      setSelectionIds(next.mySelectionIds);
    }
    if (!sameRound || (!selectionDirtyRef.current && participant?.selectionSubmitted)) {
      selectionDirtyRef.current = false;
    }
    setEvening(next);
  }

  async function refreshHistory() {
    const list = await listEvenings(groupId);
    setHistory(list);
    return list;
  }

  async function loadEvening(id: string) {
    const next = await fetchEvening(id);
    const metaKey = `${next.id}:${next.round}`;
    if (metaLoadedForRef.current !== metaKey) {
      let resolved = new Map<string, GameMeta>();
      try {
        resolved = await resolveGameMeta(
          next.candidates.map((c) => ({
            launcher: c.launcher,
            externalId: c.externalId,
            name: c.name,
          })),
        );
      } catch {
        // La soirée reste utilisable avec l’initiale encre.
      }
      setMeta(resolved);
      metaLoadedForRef.current = metaKey;
    }
    // Le ratio et les URLs sont connus avant le premier rendu de la grille.
    applyEvening(next);
    return next;
  }

  useEffect(() => {
    setSelectedParticipants(members.map((m) => m.id));
  }, [members]);

  useEffect(() => {
    if (!directDraft) return;
    setDirectGame(directDraft);
    setTitle(directDraft.name);
    setWhen(defaultEveningWhen());
    setSetupMode("direct");
    eveningRef.current = null;
    selectionDirtyRef.current = false;
    metaLoadedForRef.current = null;
    setSelectionIds([]);
    setMeta(new Map());
    setEvening(null);
    onDirectDraftConsumed?.();
  }, [directDraft, onDirectDraftConsumed]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await refreshHistory();
        if (cancelled) return;
        if (directDraft || setupMode) return;
        const urgent = list.find(
          (item) =>
            item.kind !== "direct" && isLiveEveningStatus(item.status),
        );
        if (urgent) await loadEvening(urgent.id);
        else {
          eveningRef.current = null;
          selectionDirtyRef.current = false;
          metaLoadedForRef.current = null;
          setSelectionIds([]);
          setMeta(new Map());
          setEvening(null);
        }
      } catch {
        if (!cancelled) onBanner("Impossible de charger les soirées.");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, directDraft, setupMode]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = eveningRef.current;
      if (current && isLiveEveningStatus(current.status)) {
        void loadEvening(current.id).catch(() => undefined);
        return;
      }
      void refreshHistory().catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  useGSAP(
    () => {
      const tickets = rootRef.current?.querySelectorAll("[data-ticket]");
      if (tickets?.length) staggerIn(tickets, { stagger: 0.06 });
    },
    {
      scope: rootRef,
      dependencies: [evening?.id, evening?.status, setupMode],
    },
  );

  function toggleParticipant(id: string) {
    setSelectedParticipants((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleSelection(candidateId: string) {
    if (!evening || evening.status !== "selection") return;
    setSelectionIds((prev) => {
      const next = prev.includes(candidateId)
        ? prev.filter((id) => id !== candidateId)
        : prev.length < evening.shortlistSize
          ? [...prev, candidateId]
          : prev;
      selectionDirtyRef.current = true;
      return next;
    });
  }

  async function onSubmitSelection() {
    if (!evening) return;
    if (selectionIds.length < 1) {
      onBanner("Choisis au moins un jeu.");
      return;
    }
    setBusy(true);
    try {
      const next = await submitSelection(evening.id, selectionIds);
      selectionDirtyRef.current = false;
      applyEvening(next);
      onBanner("Sélection déposée.");
    } catch (error) {
      onBanner(
        error instanceof Error ? error.message : "Sélection échouée.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onStartVoting() {
    if (!evening) return;
    setBusy(true);
    try {
      const next = await startVoting(evening.id);
      applyEvening(next);
      onBanner("Vote lancé.");
    } catch (error) {
      onBanner(error instanceof Error ? error.message : "Lancement échoué.");
    } finally {
      setBusy(false);
    }
  }

  async function onCurrentVote(value: VoteValue) {
    if (!evening || evening.status !== "voting") return;
    const candidate = evening.candidates[evening.currentCandidateIndex ?? 0];
    if (!candidate) return;
    setBusy(true);
    try {
      const next = await submitCurrentVote(evening.id, candidate.id, value);
      applyEvening(next);
    } catch (error) {
      onBanner(error instanceof Error ? error.message : "Vote échoué.");
    } finally {
      setBusy(false);
    }
  }

  async function onCreate() {
    if (selectedParticipants.length < 1) {
      onBanner("Sélectionne au moins un participant.");
      return;
    }
    setBusy(true);
    try {
      const created = await createEvening(groupId, {
        title: title.trim() || undefined,
        durationMinutes,
        vibe,
        requireInstalled,
        shortlistSize,
        scheduledAt: eveningWhenToIso(when),
        participantIds: selectedParticipants.includes(currentUserId)
          ? selectedParticipants
          : [...selectedParticipants, currentUserId],
      });
      applyEvening(created);
      setSetupMode(null);
      setWhen(defaultEveningWhen());
      await refreshHistory();
      onBanner("Lobby ouvert.");
    } catch (error) {
      onBanner(
        error instanceof Error ? error.message : "Création de soirée échouée.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onCreateDirect() {
    if (!directGame) {
      onBanner("Choisis un jeu.");
      return;
    }
    if (selectedParticipants.length < 1) {
      onBanner("Sélectionne au moins un participant.");
      return;
    }
    setBusy(true);
    try {
      const created = await createEvening(groupId, {
        kind: "direct",
        appId: directGame.appId,
        title: title.trim() || directGame.name,
        scheduledAt: eveningWhenToIso(when),
        participantIds: selectedParticipants.includes(currentUserId)
          ? selectedParticipants
          : [...selectedParticipants, currentUserId],
      });
      applyEvening(created);
      setSetupMode(null);
      setDirectGame(null);
      setTitle("");
      setWhen(defaultEveningWhen());
      await refreshHistory();
      onBanner("Lobby ouvert.");
    } catch (error) {
      onBanner(
        error instanceof Error ? error.message : "Création de soirée échouée.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteHistoryItem(id: string) {
    setBusy(true);
    try {
      await deleteEvening(id);
      await refreshHistory();
      setHistoryConfirm(null);
      onBanner("Soirée effacée.");
    } catch (error) {
      onBanner(
        error instanceof Error ? error.message : "Suppression échouée.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onClearHistory() {
    setBusy(true);
    try {
      await clearEveningHistory(groupId);
      await refreshHistory();
      setHistoryConfirm(null);
      onBanner("Historique effacé.");
    } catch (error) {
      onBanner(
        error instanceof Error ? error.message : "Suppression échouée.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onReady() {
    if (!evening) return;
    setBusy(true);
    try {
      const next = await markEveningReady(evening.id);
      applyEvening(next);
    } catch (error) {
      onBanner(error instanceof Error ? error.message : "Prêt impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function onOpenSelection() {
    if (!evening) return;
    setBusy(true);
    try {
      const next = await openEveningSelection(evening.id);
      applyEvening(next);
      setSkipUnreadyOpen(false);
      onBanner(evening.kind === "direct" ? "Confirmé." : "Sélection ouverte.");
    } catch (error) {
      onBanner(
        error instanceof Error ? error.message : "Lancement impossible.",
      );
    } finally {
      setBusy(false);
    }
  }

  const me = evening?.participants.find((p) => p.id === currentUserId);
  const iAmParticipant = Boolean(me?.present);
  const mySelectionSubmitted = Boolean(
    evening?.participants.find((p) => p.id === currentUserId)
      ?.selectionSubmitted,
  );
  const iOrganize = canOrganize || evening?.createdBy === currentUserId;
  const winner = evening?.candidates.find(
    (c) => c.id === (evening.winnerCandidateId ?? evening.resolution?.winnerId),
  );
  const idle =
    !evening ||
    evening.status === "closed" ||
    evening.status === "cancelled";
  const openList = history.filter((item) => isLiveEveningStatus(item.status));
  const pendingHistoryItem =
    historyConfirm && historyConfirm !== "all"
      ? history.find((item) => item.id === historyConfirm)
      : undefined;
  return (
    <>
    <div ref={rootRef} className="grid gap-6">
      {idle ? (
        setupMode === "ritual" ? (
          <SetupForm
            title={title}
            setTitle={setTitle}
            durationMinutes={durationMinutes}
            setDurationMinutes={setDurationMinutes}
            shortlistSize={shortlistSize}
            setShortlistSize={setShortlistSize}
            vibe={vibe}
            setVibe={setVibe}
            requireInstalled={requireInstalled}
            setRequireInstalled={setRequireInstalled}
            when={when}
            setWhen={setWhen}
            members={members}
            selectedParticipants={selectedParticipants}
            toggleParticipant={toggleParticipant}
            busy={busy}
            onAbort={() => setSetupMode(null)}
            onLaunch={() => void onCreate()}
          />
        ) : setupMode === "direct" ? (
          <DirectSetupForm
            title={title}
            setTitle={setTitle}
            when={when}
            setWhen={setWhen}
            game={directGame}
            onPickGame={(hit) => {
              setDirectGame({
                appId: hit.appId,
                name: hit.name,
                coverUrl: hit.coverUrl,
                steamUrl: hit.steamUrl,
                priceLabel: hit.priceLabel,
              });
              if (!title.trim()) setTitle(hit.name);
            }}
            onClearGame={() => setDirectGame(null)}
            members={members}
            selectedParticipants={selectedParticipants}
            toggleParticipant={toggleParticipant}
            busy={busy}
            onAbort={() => {
              setSetupMode(null);
              setDirectGame(null);
            }}
            onLaunch={() => void onCreateDirect()}
          />
        ) : (
          <div className="grid gap-6">
            <div className="flex flex-wrap items-end justify-between gap-5 border border-rule-strong p-6">
              <div>
                <p className="pn-data mb-2">{groupName}</p>
                <h3 className="pn-display text-4xl">Soirées</h3>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="primary"
                  onClick={() => {
                    setWhen(defaultEveningWhen());
                    setSetupMode("ritual");
                  }}
                >
                  Nouvelle soirée
                </Button>
                <Button
                  variant="second"
                  onClick={() => {
                    setWhen(defaultEveningWhen());
                    setDirectGame(null);
                    setTitle("");
                    setSetupMode("direct");
                  }}
                >
                  Proposer une soirée
                </Button>
              </div>
            </div>
            {openList.length > 0 ? (
              <OpenEveningList
                evenings={openList}
                onOpen={(id) => void loadEvening(id)}
              />
            ) : (
              <EmptyHint
                title="Aucune soirée en cours"
                body="Lance une nouvelle soirée pour choisir."
              />
            )}
            <EveningHistory
              history={history}
              isOwner={isOwner}
              busy={busy}
              onDelete={(id) => setHistoryConfirm(id)}
              onClearAll={() => setHistoryConfirm("all")}
            />
          </div>
        )
      ) : evening.status === "lobby" ? (
        <LobbyView
          evening={evening}
          groupName={groupName}
          currentUserId={currentUserId}
          iAmParticipant={iAmParticipant}
          iOrganize={iOrganize}
          busy={busy}
          onReady={() => void onReady()}
          onSkipUnready={() => setSkipUnreadyOpen(true)}
          onBack={() => {
            eveningRef.current = null;
            setEvening(null);
          }}
          onConfirmDirect={() => void onOpenSelection()}
          onCancel={() =>
            void cancelEvening(evening.id)
              .then((next) => applyEvening(next))
              .then(() => refreshHistory())
              .then(() => {
                eveningRef.current = null;
                setEvening(null);
                onBanner("Annulée.");
              })
              .catch((e: Error) => onBanner(e.message))
          }
        />
      ) : evening.status === "selection" ? (
        <SelectionView
          evening={evening}
          meta={meta}
          selectionIds={selectionIds}
          selectionSubmitted={mySelectionSubmitted}
          iAmParticipant={iAmParticipant}
          iOrganize={iOrganize}
          busy={busy}
          onToggle={toggleSelection}
          onSubmit={() => void onSubmitSelection()}
          onStart={() => void onStartVoting()}
          onCancel={() =>
            void cancelEvening(evening.id)
              .then((next) => applyEvening(next))
              .then(() => refreshHistory())
              .then(() => onBanner("Annulée."))
              .catch((e: Error) => onBanner(e.message))
          }
        />
      ) : evening.status === "voting" ? (
        <SequentialVoteView
          evening={evening}
          meta={meta}
          iAmParticipant={iAmParticipant}
          iOrganize={iOrganize}
          busy={busy}
          onVote={(value) => void onCurrentVote(value)}
          onCancel={() =>
            void cancelEvening(evening.id)
              .then((next) => applyEvening(next))
              .then(() => refreshHistory())
              .then(() => onBanner("Annulée."))
              .catch((e: Error) => onBanner(e.message))
          }
        />
      ) : evening.status === "revealed" && winner ? (
        <ResultView
          evening={evening}
          winner={winner}
          meta={meta}
          iOrganize={iOrganize}
          busy={busy}
          onConfirm={() =>
            void closeEvening(evening.id)
              .then((next) => applyEvening(next))
              .then(() => refreshHistory())
              .then(() => onBanner("Choix confirmé."))
              .catch((e: Error) => onBanner(e.message))
          }
          onRoulette={() =>
            void rouletteEvening(evening.id)
              .then((next) => applyEvening(next))
              .catch((e: Error) => onBanner(e.message))
          }
          onRevoteTie={() =>
            void revoteTie(evening.id)
              .then((next) => applyEvening(next))
              .catch((e: Error) => onBanner(e.message))
          }
          onNewRound={() =>
            void newEveningRound(evening.id)
              .then((next) => applyEvening(next))
              .catch((e: Error) => onBanner(e.message))
          }
          onCancel={() =>
            void cancelEvening(evening.id)
              .then((next) => applyEvening(next))
              .then(() => refreshHistory())
              .then(() => onBanner("Annulée."))
              .catch((e: Error) => onBanner(e.message))
          }
        />
      ) : null}
    </div>
    {skipUnreadyOpen && evening ? (
      <ConfirmDialog
        title="Lancer sans eux"
        confirmLabel="Lancer sans eux"
        confirmVariant="primary"
        busy={busy}
        busyLabel="Lancement…"
        onConfirm={() => void onOpenSelection()}
        onCancel={() => {
          if (!busy) setSkipUnreadyOpen(false);
        }}
      >
        Les joueurs encore en attente sortent du tour.
      </ConfirmDialog>
    ) : null}
    {historyConfirm === "all" ? (
      <ConfirmDialog
        title="Tout effacer"
        confirmLabel="Tout effacer"
        busy={busy}
        onConfirm={() => void onClearHistory()}
        onCancel={() => {
          if (!busy) setHistoryConfirm(null);
        }}
      >
        Toutes les soirées terminées.
      </ConfirmDialog>
    ) : historyConfirm ? (
      <ConfirmDialog
        title="Effacer la soirée"
        confirmLabel="Effacer"
        busy={busy}
        onConfirm={() => void onDeleteHistoryItem(historyConfirm)}
        onCancel={() => {
          if (!busy) setHistoryConfirm(null);
        }}
      >
        {eveningDisplayTitle(
          pendingHistoryItem?.title,
          pendingHistoryItem?.createdAt ?? new Date().toISOString(),
          pendingHistoryItem?.scheduledAt,
        )}
      </ConfirmDialog>
    ) : null}
    </>
  );
}

function LobbyView(props: {
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
}) {
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
            <p className="pn-data mb-2">Phase 00 · Lobby</p>
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
                ? "En attente des autres"
                : "Présence requise"
              : "Hors tour"}
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

function SelectionView(props: {
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
}) {
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

function SequentialVoteView(props: {
  evening: Evening;
  meta: Map<string, GameMeta>;
  iAmParticipant: boolean;
  iOrganize: boolean;
  busy: boolean;
  onVote: (value: VoteValue) => void;
  onCancel: () => void;
}) {
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

function SetupForm(props: {
  title: string;
  setTitle: (v: string) => void;
  durationMinutes: number | null;
  setDurationMinutes: (v: number | null) => void;
  shortlistSize: number;
  setShortlistSize: (v: number) => void;
  vibe: EveningVibe;
  setVibe: (v: EveningVibe) => void;
  requireInstalled: boolean;
  setRequireInstalled: (v: boolean) => void;
  when: EveningWhenValue;
  setWhen: (v: EveningWhenValue) => void;
  members: GroupMember[];
  selectedParticipants: string[];
  toggleParticipant: (id: string) => void;
  busy: boolean;
  onAbort: () => void;
  onLaunch: () => void;
}) {
  const durationValue = props.durationMinutes ?? 0;
  const durationHours = Math.floor(durationValue / 60);
  const durationRemainder = durationValue % 60;
  const setDuration = (hours: number, minutes: number) => {
    const total = Math.min(600, Math.max(15, hours * 60 + minutes));
    props.setDurationMinutes(total);
  };

  return (
    <div className="grid max-w-3xl gap-5 border border-rule-strong p-6">
      <div>
        <p className="pn-data mb-2">Soirée</p>
        <h3 className="pn-display text-4xl">Init soirée</h3>
        <span className="pn-accent mt-3" />
      </div>
      <EveningWhenField value={props.when} onChange={props.setWhen} />
      <div className="flex flex-wrap gap-2">
        <input
          className="min-w-[200px] flex-1 border border-rule-strong bg-ink-deep px-3 py-3 font-data text-xs tracking-[0.1em] uppercase outline-none focus:border-paper"
          placeholder="Titre"
          value={props.title}
          maxLength={80}
          onChange={(e) => props.setTitle(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2 border border-rule-strong bg-ink-deep px-3 py-2.5 font-data text-xs tracking-[0.1em] uppercase">
          <span>Durée</span>
          <input
            className="w-10 border border-rule-strong bg-ink px-2 py-1 text-right font-data text-xs outline-none focus:border-veto"
            type="number"
            min={0}
            max={10}
            value={props.durationMinutes === null ? "" : durationHours}
            disabled={props.durationMinutes === null}
            aria-label="Heures"
            onChange={(e) =>
              setDuration(Number(e.target.value) || 0, durationRemainder)
            }
          />
          <span>h</span>
          <select
            className="border border-rule-strong bg-ink px-2 py-1 font-data text-xs outline-none focus:border-veto"
            value={props.durationMinutes === null ? 0 : durationRemainder}
            disabled={props.durationMinutes === null}
            aria-label="Minutes"
            onChange={(e) =>
              setDuration(durationHours, Number(e.target.value))
            }
          >
            {Array.from({ length: 12 }, (_, index) => index * 5).map(
              (minutes) => (
                <option key={minutes} value={minutes}>
                  {String(minutes).padStart(2, "0")}
                </option>
              ),
            )}
          </select>
          <span>min</span>
        </div>
        <Checkbox
          checked={props.durationMinutes === null}
          label="Sans limite"
          onChange={(checked) =>
            props.setDurationMinutes(checked ? null : 90)
          }
        />
        <select
          className="border border-rule-strong bg-ink-deep px-3 py-3 font-data text-xs tracking-[0.1em] uppercase"
          value={props.shortlistSize}
          onChange={(e) => props.setShortlistSize(Number(e.target.value))}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {pad2(n)} jeux
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap border border-rule-strong">
        {VIBES.map((option) => (
          <button
            key={option.value}
            type="button"
            className={
              props.vibe === option.value
                ? "bg-paper px-3 py-2.5 font-ui text-xs font-bold uppercase tracking-[0.12em] text-ink-deep"
                : "border-r border-rule-strong px-3 py-2.5 font-ui text-xs font-bold uppercase tracking-[0.12em] text-smoke last:border-r-0"
            }
            onClick={() => props.setVibe(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-6">
        <Checkbox
          checked={props.requireInstalled}
          label="Installé"
          onChange={props.setRequireInstalled}
        />
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {props.members.map((member) => {
          const on = props.selectedParticipants.includes(member.id);
          return (
            <li key={member.id}>
              <button
                type="button"
                aria-pressed={on}
                className={
                  on
                    ? "border border-paper bg-ink-raise px-3 py-2 font-ui text-xs uppercase tracking-[0.1em]"
                    : "border border-rule-strong px-3 py-2 font-ui text-xs uppercase tracking-[0.1em] text-smoke"
                }
                onClick={() => props.toggleParticipant(member.id)}
              >
                {member.displayName}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-3">
        <Button variant="primary" disabled={props.busy} onClick={props.onLaunch}>
          Lancer
        </Button>
        <Button variant="ghost" disabled={props.busy} onClick={props.onAbort}>
          Annuler
        </Button>
      </div>
    </div>
  );
}

function DirectSetupForm(props: {
  title: string;
  setTitle: (v: string) => void;
  when: EveningWhenValue;
  setWhen: (v: EveningWhenValue) => void;
  game: DirectEveningDraft | null;
  onPickGame: (hit: SteamCatalogHit) => void;
  onClearGame: () => void;
  members: GroupMember[];
  selectedParticipants: string[];
  toggleParticipant: (id: string) => void;
  busy: boolean;
  onAbort: () => void;
  onLaunch: () => void;
}) {
  return (
    <div className="grid max-w-3xl gap-5 border border-rule-strong p-6">
      <div>
        <p className="pn-data mb-2">Soirée</p>
        <h3 className="pn-display text-4xl">Proposer une soirée</h3>
        <span className="pn-accent mt-3" />
      </div>
      <EveningWhenField value={props.when} onChange={props.setWhen} />
      {props.game ? (
        <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-4 border border-rule-strong p-3">
          <GamePoster
            name={props.game.name}
            launcher="steam"
            externalId={props.game.appId}
            coverUrl={props.game.coverUrl}
          />
          <div className="self-center">
            <p className="font-ui text-sm font-bold uppercase tracking-[0.08em]">
              {props.game.name}
            </p>
            <p className="pn-data mt-1">{props.game.priceLabel ?? "Steam"}</p>
            <button
              type="button"
              className="pn-data mt-2 hover:text-paper"
              onClick={props.onClearGame}
            >
              Changer
            </button>
          </div>
        </div>
      ) : (
        <SteamSearch disabled={props.busy} onPick={props.onPickGame} />
      )}
      <input
        className="border border-rule-strong bg-ink-deep px-3 py-3 font-data text-xs tracking-[0.1em] uppercase outline-none focus:border-paper"
        placeholder="Titre"
        value={props.title}
        maxLength={80}
        onChange={(event) => props.setTitle(event.target.value)}
      />
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {props.members.map((member) => {
          const on = props.selectedParticipants.includes(member.id);
          return (
            <li key={member.id}>
              <button
                type="button"
                aria-pressed={on}
                className={
                  on
                    ? "border border-paper bg-ink-raise px-3 py-2 font-ui text-xs uppercase tracking-[0.1em]"
                    : "border border-rule-strong px-3 py-2 font-ui text-xs uppercase tracking-[0.1em] text-smoke"
                }
                onClick={() => props.toggleParticipant(member.id)}
              >
                {member.displayName}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="primary"
          disabled={props.busy || !props.game}
          onClick={props.onLaunch}
        >
          Lancer
        </Button>
        <Button variant="ghost" disabled={props.busy} onClick={props.onAbort}>
          Annuler
        </Button>
      </div>
    </div>
  );
}

function OpenEveningList(props: {
  evenings: EveningSummary[];
  onOpen: (id: string) => void;
}) {
  return (
    <section className="border border-rule-strong p-6">
      <div className="mb-3 border-b border-rule pb-3">
        <p className="pn-data text-paper">Ouvertes</p>
      </div>
      <ul className="m-0 list-none p-0">
        {props.evenings.map((item) => (
          <li
            key={item.id}
            className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] items-center gap-4 border-b border-rule py-3 last:border-b-0"
          >
            <span className="truncate font-ui text-xs font-bold uppercase tracking-[0.1em] text-paper">
              {eveningDisplayTitle(item.title, item.createdAt, item.scheduledAt)}
            </span>
            <span className="pn-data truncate">
              {formatParisWhen(item.scheduledAt ?? item.createdAt)}
              {" · "}
              {item.kind === "direct" ? "Direct" : "Rituel"}
            </span>
            <Button variant="second" onClick={() => props.onOpen(item.id)}>
              Ouvrir
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EveningHistory({
  history,
  isOwner,
  busy,
  onDelete,
  onClearAll,
}: {
  history: EveningSummary[];
  isOwner: boolean;
  busy: boolean;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}) {
  const entries = history.filter((item) => !isLiveEveningStatus(item.status));
  if (entries.length === 0) return null;

  const statusLabel = (status: EveningSummary["status"]): string => {
    switch (status) {
      case "closed":
        return "Terminée";
      case "cancelled":
        return "Annulée";
      case "revealed":
        return "Résultat";
      case "voting":
        return "Vote en cours";
      case "lobby":
        return "Lobby";
      case "selection":
        return "Sélection";
    }
  };

  return (
    <section className="border border-rule-strong p-6">
      <div className="mb-3 flex items-baseline justify-between gap-4 border-b border-rule pb-3">
        <p className="pn-data text-paper">Historique des soirées</p>
        <div className="flex items-baseline gap-4">
          <p className="pn-data">{pad2(entries.length)} entrées</p>
          {isOwner ? (
            <button
              type="button"
              className="pn-data text-veto hover:text-paper"
              disabled={busy}
              onClick={onClearAll}
            >
              Tout effacer
            </button>
          ) : null}
        </div>
      </div>
      <ul className="m-0 list-none p-0">
        {entries.map((item) => (
          <li
            key={item.id}
            className={
              isOwner
                ? "grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto_auto_auto] items-center gap-4 border-b border-rule py-3 last:border-b-0"
                : "grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto_auto] items-center gap-4 border-b border-rule py-3 last:border-b-0"
            }
          >
            <span className="truncate font-ui text-xs font-bold uppercase tracking-[0.1em] text-paper">
              {eveningDisplayTitle(
                item.title,
                item.createdAt,
                item.scheduledAt,
              )}
            </span>
            <span className="truncate text-sm text-paper-2">
              {item.winnerName?.trim() || "—"}
            </span>
            <span className="pn-data">{statusLabel(item.status)}</span>
            <time className="pn-data" dateTime={item.createdAt}>
              {new Date(item.createdAt).toLocaleDateString("fr-FR")}
            </time>
            {isOwner ? (
              <button
                type="button"
                className="pn-data text-veto hover:text-paper"
                disabled={busy}
                onClick={() => onDelete(item.id)}
              >
                Effacer
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

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

function ResultView(props: {
  evening: Evening;
  winner: Evening["candidates"][number];
  meta: Map<string, GameMeta>;
  iOrganize: boolean;
  busy: boolean;
  onConfirm: () => void;
  onRoulette: () => void;
  onRevoteTie: () => void;
  onNewRound: () => void;
  onCancel: () => void;
}) {
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
        <span className="pn-stamp mb-5 self-start">
          {formatParisShort(props.evening.scheduledAt)}
        </span>
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
        {props.iOrganize ? (
          <div className="mt-auto flex flex-wrap items-center gap-4 pt-10">
            <Button variant="primary" disabled={props.busy} onClick={props.onConfirm}>
              Confirmer
            </Button>
            {direct ? null : (
            <Button variant="ghost" disabled={props.busy} onClick={props.onNewRound}>
              Relancer un tour
            </Button>
            )}
            <button
              type="button"
              className="pn-data hover:text-paper"
              disabled={props.busy}
              onClick={props.onCancel}
            >
              Annuler
            </button>
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
          </div>
        ) : (
          <p className="mt-auto border-t border-rule-strong pt-5 pn-data">
            En attente de l’organisateur
          </p>
        )}
      </div>
    </div>
  );
}
