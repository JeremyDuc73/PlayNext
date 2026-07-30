import { useEffect, useRef, useState } from "react";
import {
  cancelEvening,
  closeEvening,
  createEvening,
  fetchEvening,
  listEvenings,
  newEveningRound,
  revealEvening,
  rouletteEvening,
  submitVotes,
  vibeLabel,
  type Evening,
  type EveningSummary,
  type EveningVibe,
  type VoteValue,
} from "../lib/evenings";
import type { GroupMember } from "../lib/groups";
import { pad2 } from "../lib/format";
import { metaMapKey, resolveGameMeta, type GameMeta } from "../lib/meta";
import { gsap, prefersReducedMotion, staggerIn, useGSAP } from "../lib/motion";
import { Button } from "../ui/Button";
import { EmptyHint } from "../ui/EmptyHint";
import { coverCandidates, fallbackPosterStyle } from "../lib/covers";
import { useCoverSrc } from "../lib/useCoverSrc";
import { GamePoster } from "../ui/GamePoster";
import { PresenceRow } from "../ui/PresenceRow";
import { VoteBar } from "../ui/VoteBar";

type Props = {
  groupId: string;
  groupName: string;
  currentUserId: string;
  members: GroupMember[];
  canOrganize: boolean;
  onBanner: (message: string) => void;
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
  onBanner,
}: Props) {
  const [history, setHistory] = useState<EveningSummary[]>([]);
  const [evening, setEvening] = useState<Evening | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(90);
  const [vibe, setVibe] = useState<EveningVibe>("any");
  const [requireOwned, setRequireOwned] = useState(true);
  const [requireInstalled, setRequireInstalled] = useState(false);
  const [shortlistSize, setShortlistSize] = useState(8);
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>(
    () => members.map((m) => m.id),
  );
  const [draftVotes, setDraftVotes] = useState<Record<string, VoteValue>>({});
  const [activeCandidateId, setActiveCandidateId] = useState<string | null>(
    null,
  );
  const [meta, setMeta] = useState<Map<string, GameMeta>>(new Map());
  const [setupOpen, setSetupOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  async function refreshHistory() {
    const list = await listEvenings(groupId);
    setHistory(list);
    return list;
  }

  async function loadEvening(id: string) {
    const next = await fetchEvening(id);
    setEvening(next);
    const drafts: Record<string, VoteValue> = {};
    for (const candidate of next.candidates) {
      if (candidate.myVote) drafts[candidate.id] = candidate.myVote;
    }
    setDraftVotes(drafts);
    if (!activeCandidateId && next.candidates[0]) {
      setActiveCandidateId(next.candidates[0].id);
    }
    setMeta(
      await resolveGameMeta(
        next.candidates.map((c) => ({
          launcher: c.launcher,
          externalId: c.externalId,
          name: c.name,
        })),
      ),
    );
    return next;
  }

  useEffect(() => {
    setSelectedParticipants(members.map((m) => m.id));
  }, [members]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await refreshHistory();
        if (cancelled) return;
        const open = list.find(
          (e) => e.status === "voting" || e.status === "revealed",
        );
        if (open) await loadEvening(open.id);
        else setEvening(null);
      } catch {
        if (!cancelled) onBanner("Impossible de charger les soirées.");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  useEffect(() => {
    if (
      !evening ||
      (evening.status !== "voting" && evening.status !== "revealed")
    ) {
      return;
    }
    const timer = window.setInterval(() => {
      void loadEvening(evening.id).catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evening?.id, evening?.status]);

  useGSAP(
    () => {
      const tickets = rootRef.current?.querySelectorAll("[data-ticket]");
      if (tickets?.length) staggerIn(tickets, { stagger: 0.06 });
    },
    {
      scope: rootRef,
      dependencies: [evening?.id, evening?.status, setupOpen],
    },
  );

  function toggleParticipant(id: string) {
    setSelectedParticipants((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function setVote(candidateId: string, value: VoteValue) {
    setDraftVotes((prev) => {
      const next = { ...prev };
      if (value === "veto") {
        for (const [id, v] of Object.entries(next)) {
          if (v === "veto" && id !== candidateId) next[id] = "pass";
        }
      }
      next[candidateId] = value;
      return next;
    });
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
        requireOwned,
        requireInstalled,
        shortlistSize,
        participantIds: selectedParticipants.includes(currentUserId)
          ? selectedParticipants
          : [...selectedParticipants, currentUserId],
      });
      setEvening(created);
      setDraftVotes({});
      setActiveCandidateId(created.candidates[0]?.id ?? null);
      setSetupOpen(false);
      await refreshHistory();
      onBanner(`${pad2(created.candidates.length)} jeux en lice.`);
    } catch (error) {
      onBanner(
        error instanceof Error ? error.message : "Création de soirée échouée.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitVotes() {
    if (!evening) return;
    const votes = evening.candidates
      .map((c) => {
        const value = draftVotes[c.id];
        return value ? { candidateId: c.id, value } : null;
      })
      .filter((v): v is { candidateId: string; value: VoteValue } => Boolean(v));

    if (votes.length !== evening.candidates.length) {
      onBanner("Vote sur chaque jeu avant de déposer.");
      return;
    }

    setBusy(true);
    try {
      const next = await submitVotes(evening.id, votes);
      setEvening(next);
      onBanner(next.status === "revealed" ? "Dépouillement." : "Bulletin déposé.");
    } catch (error) {
      onBanner(error instanceof Error ? error.message : "Vote échoué.");
    } finally {
      setBusy(false);
    }
  }

  const iAmParticipant = Boolean(
    evening?.participants.some((p) => p.id === currentUserId),
  );
  const iOrganize = canOrganize || evening?.createdBy === currentUserId;
  const winner = evening?.candidates.find(
    (c) => c.id === (evening.winnerCandidateId ?? evening.resolution?.winnerId),
  );
  const votedCount = evening
    ? Object.keys(draftVotes).filter((id) =>
        evening.candidates.some((c) => c.id === id),
      ).length
    : 0;
  const idle =
    !evening ||
    evening.status === "closed" ||
    evening.status === "cancelled";
  const active =
    evening?.candidates.find((c) => c.id === activeCandidateId) ??
    evening?.candidates[0];
  const myVetoUsed = evening
    ? Object.values(draftVotes).includes("veto") || !evening.myVetoAvailable
    : false;

  return (
    <div ref={rootRef} className="grid gap-6">
      {idle ? (
        setupOpen ? (
          <SetupForm
            title={title}
            setTitle={setTitle}
            durationMinutes={durationMinutes}
            setDurationMinutes={setDurationMinutes}
            shortlistSize={shortlistSize}
            setShortlistSize={setShortlistSize}
            vibe={vibe}
            setVibe={setVibe}
            requireOwned={requireOwned}
            setRequireOwned={setRequireOwned}
            requireInstalled={requireInstalled}
            setRequireInstalled={setRequireInstalled}
            members={members}
            selectedParticipants={selectedParticipants}
            toggleParticipant={toggleParticipant}
            busy={busy}
            onAbort={() => setSetupOpen(false)}
            onLaunch={() => void onCreate()}
          />
        ) : (
          <div className="border border-rule-strong p-8">
            <p className="pn-data mb-3">
              {groupName} · Hors tour
            </p>
            <EmptyHint
              title="Aucun tour ouvert"
              body="Lance une soirée pour tirer la shortlist."
            />
            <div className="mt-6 flex flex-wrap gap-3">
              <Button variant="primary" onClick={() => setSetupOpen(true)}>
                Lancer
              </Button>
              {history.some((h) => h.status === "closed") ? (
                <p className="pn-data self-center">
                  Dernier ·{" "}
                  {history.find((h) => h.status === "closed")?.title ||
                    "Sans titre"}
                </p>
              ) : null}
            </div>
          </div>
        )
      ) : evening.status === "revealed" && winner ? (
        <ResultView
          evening={evening}
          winner={winner}
          meta={meta}
          iOrganize={iOrganize}
          busy={busy}
          onConfirm={() =>
            void closeEvening(evening.id)
              .then(setEvening)
              .then(() => refreshHistory())
              .then(() => onBanner("On joue ça."))
              .catch((e: Error) => onBanner(e.message))
          }
          onRoulette={() =>
            void rouletteEvening(evening.id)
              .then(setEvening)
              .catch((e: Error) => onBanner(e.message))
          }
          onNewRound={() =>
            void newEveningRound(evening.id)
              .then(setEvening)
              .catch((e: Error) => onBanner(e.message))
          }
        />
      ) : (
        <LiveView
          evening={evening}
          groupName={groupName}
          meta={meta}
          draftVotes={draftVotes}
          votedCount={votedCount}
          active={active}
          iAmParticipant={iAmParticipant}
          iOrganize={iOrganize}
          myVetoUsed={myVetoUsed}
          busy={busy}
          onSelectCandidate={setActiveCandidateId}
          onVote={setVote}
          onSubmit={() => void onSubmitVotes()}
          onReveal={() =>
            void revealEvening(evening.id)
              .then(setEvening)
              .then(() => onBanner("Révélé."))
              .catch((e: Error) => onBanner(e.message))
          }
          onCancel={() =>
            void cancelEvening(evening.id)
              .then(setEvening)
              .then(() => refreshHistory())
              .then(() => onBanner("Annulée."))
              .catch((e: Error) => onBanner(e.message))
          }
        />
      )}
    </div>
  );
}

function SetupForm(props: {
  title: string;
  setTitle: (v: string) => void;
  durationMinutes: number;
  setDurationMinutes: (v: number) => void;
  shortlistSize: number;
  setShortlistSize: (v: number) => void;
  vibe: EveningVibe;
  setVibe: (v: EveningVibe) => void;
  requireOwned: boolean;
  setRequireOwned: (v: boolean) => void;
  requireInstalled: boolean;
  setRequireInstalled: (v: boolean) => void;
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
        <h3 className="pn-display text-4xl">Init soirée</h3>
        <span className="pn-accent mt-3" />
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          className="min-w-[200px] flex-1 border border-rule-strong bg-ink-deep px-3 py-3 font-data text-xs tracking-[0.1em] uppercase outline-none focus:border-paper"
          placeholder="Titre"
          value={props.title}
          maxLength={80}
          onChange={(e) => props.setTitle(e.target.value)}
        />
        <select
          className="border border-rule-strong bg-ink-deep px-3 py-3 font-data text-xs tracking-[0.1em] uppercase"
          value={props.durationMinutes}
          onChange={(e) => props.setDurationMinutes(Number(e.target.value))}
        >
          <option value={60}>60 min</option>
          <option value={90}>90 min</option>
          <option value={120}>120 min</option>
          <option value={180}>180 min</option>
        </select>
        <select
          className="border border-rule-strong bg-ink-deep px-3 py-3 font-data text-xs tracking-[0.1em] uppercase"
          value={props.shortlistSize}
          onChange={(e) => props.setShortlistSize(Number(e.target.value))}
        >
          {[5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
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
      <div className="flex flex-wrap gap-6 font-data text-[11px] tracking-[0.12em] text-smoke uppercase">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={props.requireOwned}
            onChange={(e) => props.setRequireOwned(e.target.checked)}
          />
          Possédé par tous
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={props.requireInstalled}
            onChange={(e) => props.setRequireInstalled(e.target.checked)}
          />
          Installé
        </label>
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

function LiveView(props: {
  evening: Evening;
  groupName: string;
  meta: Map<string, GameMeta>;
  draftVotes: Record<string, VoteValue>;
  votedCount: number;
  active?: Evening["candidates"][number];
  iAmParticipant: boolean;
  iOrganize: boolean;
  myVetoUsed: boolean;
  busy: boolean;
  onSelectCandidate: (id: string) => void;
  onVote: (id: string, v: VoteValue) => void;
  onSubmit: () => void;
  onReveal: () => void;
  onCancel: () => void;
}) {
  const { evening } = props;
  const ready = evening.participants.filter((p) => p.hasVoted).length;

  return (
    <div className="grid gap-0 border border-rule-strong lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 border-b border-rule-strong lg:border-b-0 lg:border-r">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-rule-strong p-5">
          <div>
            <p className="pn-data mb-2">
              {props.groupName} — Tour {pad2(evening.round)} en cours
            </p>
            <h3 className="pn-display text-[clamp(2.4rem,5vw,4.5rem)]">
              {evening.title || "On décide"}
            </h3>
            <p className="mt-2 pn-data">
              {vibeLabel(evening.vibe)}
              {evening.durationMinutes
                ? ` · ${evening.durationMinutes} min`
                : ""}
              {evening.status === "voting" ? " · Bulletins scellés" : ""}
            </p>
          </div>
          <div className="border border-rule-strong px-4 py-3 text-right">
            <p className="pn-data mb-1">Fin des bulletins</p>
            <p className="pn-display text-3xl">
              {pad2(ready)}/{pad2(evening.participants.length)}
            </p>
          </div>
        </div>

        <div className="border-b border-rule-strong px-5 py-4">
          <div className="mb-2 flex flex-wrap justify-between gap-2">
            <p className="pn-data">
              {pad2(ready)} / {pad2(evening.participants.length)} déposés
            </p>
            <p className="pn-data">
              Dépouillement automatique à{" "}
              {pad2(evening.participants.length)} /{" "}
              {pad2(evening.participants.length)}
            </p>
          </div>
          <div className="pn-gauge">
            {evening.participants.map((p) => (
              <i key={p.id} data-done={p.hasVoted ? "" : undefined} />
            ))}
          </div>
        </div>

        <div className="p-5">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <p className="pn-data">
              En lice — {pad2(evening.candidates.length)} jeux
            </p>
            {props.iOrganize ? (
              <div className="flex gap-3">
                {evening.status === "voting" ? (
                  <button
                    type="button"
                    className="pn-data hover:text-paper"
                    disabled={props.busy}
                    onClick={props.onReveal}
                  >
                    Révéler
                  </button>
                ) : null}
                <button
                  type="button"
                  className="pn-data hover:text-paper"
                  disabled={props.busy}
                  onClick={props.onCancel}
                >
                  Annuler
                </button>
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {evening.candidates.map((candidate, index) => {
              const m = props.meta.get(
                metaMapKey(candidate.launcher, candidate.externalId),
              );
              const vote = props.draftVotes[candidate.id];
              const vetoed = vote === "veto" || candidate.eliminated;
              return (
                <div key={candidate.id} data-ticket>
                  <GamePoster
                    name={candidate.name}
                    launcher={candidate.launcher}
                    externalId={candidate.externalId}
                    coverUrl={m?.coverUrl}
                    index={pad2(index + 1)}
                    selected={props.active?.id === candidate.id}
                    vetoed={vetoed}
                    subtitle={`${pad2(candidate.ownedCount)}/${pad2(candidate.participantCount)}`}
                    onClick={() => props.onSelectCandidate(candidate.id)}
                    wide
                  />
                </div>
              );
            })}
          </div>
        </div>

        {evening.status === "voting" && props.iAmParticipant && props.active ? (
          <div className="sticky bottom-0 border-t border-paper bg-ink p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="pn-data">
                Bulletin — {props.active.name}
              </p>
              <p className="pn-data">
                {props.myVetoUsed ? "0 veto restant" : "1 veto restant"} ·{" "}
                {pad2(props.votedCount)}/{pad2(evening.candidates.length)}
              </p>
            </div>
            <VoteBar
              value={props.draftVotes[props.active.id]}
              disabled={props.busy}
              vetoDisabled={
                props.myVetoUsed &&
                props.draftVotes[props.active.id] !== "veto"
              }
              onChange={(v) => props.onVote(props.active!.id, v)}
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                variant="primary"
                disabled={
                  props.busy ||
                  props.votedCount < evening.candidates.length
                }
                onClick={props.onSubmit}
              >
                Déposer mon bulletin
              </Button>
            </div>
          </div>
        ) : null}

        {evening.status === "voting" && !props.iAmParticipant ? (
          <p className="border-t border-rule-strong p-5 pn-data">Spectateur</p>
        ) : null}
      </div>

      <aside className="bg-ink-deep p-5">
        <p className="pn-data mb-4">Dépouillement</p>
        <PresenceRow
          people={evening.participants.map((p) => ({
            id: p.id,
            displayName: p.displayName,
            avatarUrl: p.avatarUrl,
            ready: p.hasVoted,
            veto: !p.vetoAvailable && p.hasVoted,
          }))}
        />
      </aside>
    </div>
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
  onNewRound: () => void;
}) {
  const coverRef = useRef<HTMLDivElement>(null);
  const m = props.meta.get(
    metaMapKey(props.winner.launcher, props.winner.externalId),
  );

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
      <div ref={coverRef} className="relative min-h-[320px] bg-ink-deep">
        <span className="pn-stamp absolute left-4 top-4 z-10">Ce soir</span>
        <p
          className="absolute bottom-4 left-4 z-10 pn-data"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          Résultat — Tour {pad2(props.evening.round)}
        </p>
        <ResultCover
          name={props.winner.name}
          coverUrl={m?.coverUrl}
          launcher={props.winner.launcher}
          externalId={props.winner.externalId}
        />
      </div>
      <div className="flex flex-col p-6 md:p-10">
        <p className="pn-data mb-6">
          Tour {pad2(props.evening.round)} ·{" "}
          {pad2(props.evening.participants.length)} /{" "}
          {pad2(props.evening.participants.length)} bulletins
        </p>
        <h3 className="pn-display text-[clamp(2.8rem,6vw,5.5rem)]">
          {props.winner.name}
        </h3>
        <ul className="mt-8 m-0 list-none border-t border-rule p-0">
          {(
            [
              ["Chaud", props.winner.tally?.hot ?? 0],
              ["Pourquoi pas", props.winner.tally?.maybe ?? 0],
              ["Passer", props.winner.tally?.pass ?? 0],
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
        {props.iOrganize ? (
          <div className="mt-auto flex flex-wrap items-center gap-4 pt-10">
            <Button variant="primary" disabled={props.busy} onClick={props.onConfirm}>
              On joue ça
            </Button>
            <Button variant="ghost" disabled={props.busy} onClick={props.onNewRound}>
              Relancer un tour
            </Button>
            <button
              type="button"
              className="pn-data hover:text-paper"
              disabled={props.busy}
              onClick={props.onRoulette}
            >
              Tirage
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
