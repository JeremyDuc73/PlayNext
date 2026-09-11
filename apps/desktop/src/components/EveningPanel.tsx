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
  openEveningSelection,
  revoteTie,
  rouletteEvening,
  startVoting,
  submitCurrentVote,
  submitSelection,
  subscribeEveningStream,
  type DirectEveningDraft,
  type Evening,
  type EveningSummary,
  type EveningVibe,
  type VoteValue,
} from "../lib/evenings";
import type { GroupMember } from "../lib/groups";
import {
  defaultEveningWhen,
  eveningWhenToIso,
  isEveningPast,
  type EveningWhenValue,
} from "../lib/paris";
import { resolveGameMeta, type GameMeta } from "../lib/meta";
import { staggerIn, useGSAP } from "../lib/motion";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { EmptyHint } from "../ui/EmptyHint";
import { DirectSetupForm } from "./evening/DirectSetupForm";
import { EveningHistory } from "./evening/EveningHistory";
import { LobbyView } from "./evening/LobbyView";
import { OpenEveningList } from "./evening/OpenEveningList";
import { ResultView } from "./evening/ResultView";
import { SelectionView } from "./evening/SelectionView";
import { SequentialVoteView } from "./evening/SequentialVoteView";
import { SetupForm } from "./evening/SetupForm";
import { useAppStore } from "../stores/useAppStore";

type Props = {
  groupId: string;
  groupName: string;
  currentUserId: string;
  members: GroupMember[];
  canOrganize: boolean;
  isOwner: boolean;
  onBanner?: (message: string) => void;
  directDraft?: DirectEveningDraft | null;
  onDirectDraftConsumed?: () => void;
  openEveningId?: string | null;
  onOpenEveningConsumed?: () => void;
};

export function EveningPanel({
  groupId,
  groupName,
  currentUserId,
  members,
  canOrganize,
  isOwner,
  onBanner: onBannerProp,
  directDraft = null,
  onDirectDraftConsumed,
  openEveningId = null,
  onOpenEveningConsumed,
}: Props) {
  const storeDirectDraft = useAppStore((s) => s.directDraft);
  const setStoreDirectDraft = useAppStore((s) => s.setDirectDraft);
  const storeOpenEveningId = useAppStore((s) => s.openEveningId);
  const setStoreOpenEveningId = useAppStore((s) => s.setOpenEveningId);
  const storeNotify = useAppStore((s) => s.notify);
  const onBanner = onBannerProp ?? storeNotify;

  const effectiveDirectDraft = directDraft ?? storeDirectDraft;
  const effectiveOpenEveningId = openEveningId ?? storeOpenEveningId;

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
  const [cancelEveningId, setCancelEveningId] = useState<string | null>(null);
  const [historyConfirm, setHistoryConfirm] = useState<"all" | string | null>(
    null,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const eveningRef = useRef<Evening | null>(null);
  const selectionDirtyRef = useRef(false);
  const metaLoadedForRef = useRef<string | null>(null);
  const skipHistoryAutoloadRef = useRef(Boolean(effectiveOpenEveningId));

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

  async function syncEvening(next: Evening) {
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

  async function loadEvening(id: string) {
    const next = await fetchEvening(id);
    return syncEvening(next);
  }

  useEffect(() => {
    setSelectedParticipants(members.map((m) => m.id));
  }, [members]);

  useEffect(() => {
    if (!effectiveDirectDraft) return;
    setDirectGame(effectiveDirectDraft);
    setTitle(effectiveDirectDraft.name);
    setWhen(defaultEveningWhen());
    setSetupMode("direct");
    eveningRef.current = null;
    selectionDirtyRef.current = false;
    metaLoadedForRef.current = null;
    setSelectionIds([]);
    setMeta(new Map());
    setEvening(null);
    onDirectDraftConsumed?.();
    setStoreDirectDraft(null);
  }, [effectiveDirectDraft, onDirectDraftConsumed, setStoreDirectDraft]);

  useEffect(() => {
    if (!effectiveOpenEveningId) return;
    skipHistoryAutoloadRef.current = true;
    let cancelled = false;
    void loadEvening(effectiveOpenEveningId)
      .then(() => {
        if (!cancelled) {
          onOpenEveningConsumed?.();
          setStoreOpenEveningId(null);
        }
      })
      .catch((error: Error) => {
        if (!cancelled) {
          onBanner(error.message);
          onOpenEveningConsumed?.();
          setStoreOpenEveningId(null);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveOpenEveningId]);

  useEffect(() => {
    skipHistoryAutoloadRef.current = Boolean(effectiveOpenEveningId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, effectiveOpenEveningId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await refreshHistory();
        if (cancelled) return;
        if (effectiveDirectDraft || setupMode || skipHistoryAutoloadRef.current) return;
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
  }, [groupId, effectiveDirectDraft, setupMode]);

  useEffect(() => {
    const activeId = evening?.id;
    if (!activeId || !isLiveEveningStatus(evening.status)) return;

    let cancelled = false;
    const unsubscribe = subscribeEveningStream(
      activeId,
      (next) => {
        if (!cancelled) void syncEvening(next);
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evening?.id, evening?.status]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = eveningRef.current;
      if (current && isLiveEveningStatus(current.status)) {
        void loadEvening(current.id).catch(() => undefined);
        return;
      }
      void refreshHistory().catch(() => undefined);
    }, 10000);
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

  async function onCancelEveningAction(id: string) {
    setBusy(true);
    try {
      await cancelEvening(id);
      await refreshHistory();
      setCancelEveningId(null);
      if (evening?.id === id) {
        eveningRef.current = null;
        setEvening(null);
      }
      onBanner("Soirée annulée.");
    } catch (error) {
      onBanner(
        error instanceof Error ? error.message : "Annulation impossible.",
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
  const winner =
    evening?.candidates.find(
      (c) => c.id === (evening.winnerCandidateId ?? evening.resolution?.winnerId),
    ) ?? (evening?.kind === "direct" ? evening.candidates[0] : undefined);
  const idle = !evening || evening.status === "cancelled";
  const openList = history.filter(
    (item) =>
      item.status !== "cancelled" &&
      (isLiveEveningStatus(item.status) ||
        (item.status === "closed" && !isEveningPast(item.scheduledAt, item.createdAt))),
  );
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
                  Proposer un jeu
                </Button>
              </div>
            </div>
            {openList.length > 0 ? (
              <OpenEveningList
                evenings={openList}
                onOpen={(id) => void loadEvening(id)}
                canOrganize={canOrganize || isOwner}
                onCancel={(id) => setCancelEveningId(id)}
              />
            ) : (
              <EmptyHint
                title="Pas de soirée prévue"
                body="Lance une session pour trouver à quoi jouer avec ta bande !"
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
              .then(() => {
                eveningRef.current = null;
                setEvening(null);
                onBanner("Soirée annulée.");
              })
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
              .then(() => {
                eveningRef.current = null;
                setEvening(null);
                onBanner("Soirée annulée.");
              })
              .catch((e: Error) => onBanner(e.message))
          }
        />
      ) : evening.status === "revealed" || evening.status === "closed" ? (
        <ResultView
          evening={evening}
          winner={winner}
          meta={meta}
          iOrganize={iOrganize}
          busy={busy}
          onBack={() => {
            eveningRef.current = null;
            setEvening(null);
          }}
          onConfirm={() =>
            void closeEvening(evening.id)
              .then((next) => applyEvening(next))
              .then(() => refreshHistory())
              .then(() => onBanner("Choix confirmé."))
              .catch((e: Error) => onBanner(e.message))
          }
          onRoulette={() =>
            rouletteEvening(evening.id)
              .then((next) => {
                applyEvening(next);
                return next;
              })
              .catch((e: Error) => {
                onBanner(e.message);
                throw e;
              })
          }
          onRevoteTie={() =>
            void revoteTie(evening.id)
              .then((next) => applyEvening(next))
              .catch((e: Error) => onBanner(e.message))
          }
          onCancel={() =>
            void cancelEvening(evening.id)
              .then((next) => applyEvening(next))
              .then(() => refreshHistory())
              .then(() => {
                eveningRef.current = null;
                setEvening(null);
                onBanner("Soirée annulée.");
              })
              .catch((e: Error) => onBanner(e.message))
          }
        />
      ) : null}
    </div>
    {cancelEveningId ? (
      <ConfirmDialog
        title="Annuler la soirée ?"
        confirmLabel="Annuler la soirée"
        confirmVariant="veto"
        busy={busy}
        busyLabel="Annulation…"
        onConfirm={() => void onCancelEveningAction(cancelEveningId)}
        onCancel={() => {
          if (!busy) setCancelEveningId(null);
        }}
      >
        La soirée sera annulée et retirée de la liste des soirées prévues.
      </ConfirmDialog>
    ) : null}
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
