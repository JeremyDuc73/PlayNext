import { useEffect, useRef, useState } from "react";
import { EveningPanel } from "./EveningPanel";
import { ProposalsPanel } from "./ProposalsPanel";
import {
  createGroup,
  createInvite,
  deleteGroup,
  fetchGroup,
  fetchGroupLibrary,
  fetchMyHiddenGames,
  hideGameFromGroup,
  joinInvite,
  leaveGroup,
  linkGroupDiscord,
  listGroups,
  listInvites,
  removeMember,
  renameGroup,
  revokeInvite,
  roleLabel,
  setMemberRole,
  transferOwnership,
  unhideGameFromGroup,
  unlinkGroupDiscord,
  fetchGroupDiscord,
  type GroupDiscord,
  type GroupInvite,
  type GroupLibraryGame,
  type GroupMember,
  type GroupSummary,
  type HiddenGroupGame,
} from "../lib/groups";
import {
  closeProposal,
  createProposal,
  listProposals,
  replyProposal,
  type GameProposal,
  type ProposalReplyValue,
} from "../lib/proposals";
import { type DirectEveningDraft } from "../lib/evenings";
import { pad2 } from "../lib/format";
import { staggerIn, useGSAP } from "../lib/motion";
import { openExternalUrl } from "../lib/desktop-auth";
import { AvatarStack } from "../ui/AvatarStack";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { EmptyHint } from "../ui/EmptyHint";
import { GamePoster } from "../ui/GamePoster";
import { PosterGrid } from "../ui/PosterGrid";
import { SquareAvatar } from "../ui/SquareAvatar";
import { SteamSearch } from "../ui/SteamSearch";

type Props = {
  enabled: boolean;
  focus: "group" | "evening";
  currentUserId: string;
  pendingInviteCode: string | null;
  onPendingInviteConsumed: () => void;
  onBanner: (message: string) => void;
  onRequestEvening?: () => void;
  focusGroupId?: string | null;
};

type LibraryFilter = "all" | "shared" | "installed";

export function GroupsPanel({
  enabled,
  focus,
  currentUserId,
  pendingInviteCode,
  onPendingInviteConsumed,
  onBanner,
  onRequestEvening,
  focusGroupId = null,
}: Props) {
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    group: GroupSummary;
    members: GroupMember[];
  } | null>(null);
  const [library, setLibrary] = useState<GroupLibraryGame[]>([]);
  const [hidden, setHidden] = useState<HiddenGroupGame[]>([]);
  const [proposals, setProposals] = useState<GameProposal[]>([]);
  const [proposeOpen, setProposeOpen] = useState(false);
  const [directDraft, setDirectDraft] = useState<DirectEveningDraft | null>(
    null,
  );
  const [invites, setInvites] = useState<GroupInvite[]>([]);
  const [newName, setNewName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const [composer, setComposer] = useState<"idle" | "create" | "join">("idle");
  const [showAdmin, setShowAdmin] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [discord, setDiscord] = useState<GroupDiscord | null>(null);
  const [discordChannelInput, setDiscordChannelInput] = useState("");
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const items = rootRef.current?.querySelectorAll("[data-channel]");
      if (items?.length) staggerIn(items, { stagger: 0.04, duration: 0.28 });
    },
    { scope: rootRef, dependencies: [groups.length, focus] },
  );

  async function refreshList() {
    const list = await listGroups();
    setGroups(list);
    return list;
  }

  async function openGroup(groupId: string) {
    setSelectedId(groupId);
    setShowAdmin(false);
    setComposer("idle");
    setProposeOpen(false);
    try {
      const [groupDetail, lib, hiddenGames, groupProposals] = await Promise.all([
        fetchGroup(groupId),
        fetchGroupLibrary(groupId),
        fetchMyHiddenGames(groupId),
        listProposals(groupId),
      ]);
      setDetail(groupDetail);
      setRenameValue(groupDetail.group.name);
      setLibrary(lib.games);
      setHidden(hiddenGames);
      setProposals(groupProposals);
      if (
        groupDetail.group.myRole === "owner" ||
        groupDetail.group.myRole === "admin"
      ) {
        setInvites(await listInvites(groupId));
      } else {
        setInvites([]);
      }
    } catch (error) {
      onBanner(
        error instanceof Error
          ? error.message
          : "Impossible d’ouvrir le groupe.",
      );
    }
  }

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    void refreshList()
      .then((list) => {
        if (cancelled) return;
        const preferred =
          focusGroupId && list.some((group) => group.id === focusGroupId)
            ? focusGroupId
            : list[0]?.id;
        if (preferred) void openGroup(preferred);
      })
      .catch(() => {
        if (!cancelled) onBanner("Impossible de charger les groupes.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !focusGroupId) return;
    if (focusGroupId === selectedId) return;
    void openGroup(focusGroupId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, focusGroupId]);

  useEffect(() => {
    if (!enabled || !selectedId || focus !== "group") return;
    if (proposals.length === 0) return;
    const timer = window.setInterval(() => {
      void listProposals(selectedId)
        .then(setProposals)
        .catch(() => undefined);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [enabled, selectedId, focus, proposals.length]);

  useEffect(() => {
    const role = detail?.group.myRole;
    const can = role === "owner" || role === "admin";
    if (!showAdmin || !can || !selectedId) {
      setDiscord(null);
      return;
    }
    let cancelled = false;
    void fetchGroupDiscord(selectedId)
      .then((next) => {
        if (!cancelled) setDiscord(next);
      })
      .catch(() => {
        if (!cancelled) setDiscord(null);
      });
    return () => {
      cancelled = true;
    };
  }, [showAdmin, selectedId, detail?.group.myRole]);

  useEffect(() => {
    if (!enabled || !pendingInviteCode) return;
    let cancelled = false;
    setBusy(true);
    void (async () => {
      try {
        const result = await joinInvite(pendingInviteCode.trim());
        if (cancelled) return;
        await refreshList();
        await openGroup(result.groupId);
        onBanner(result.alreadyMember ? "Déjà membre." : "Groupe rejoint.");
      } catch (error) {
        if (!cancelled) {
          onBanner(
            error instanceof Error ? error.message : "Invitation invalide.",
          );
        }
      } finally {
        if (!cancelled) {
          setBusy(false);
          onPendingInviteConsumed();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, pendingInviteCode]);

  async function onCreate() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const group = await createGroup(name);
      setNewName("");
      setComposer("idle");
      await refreshList();
      await openGroup(group.id);
      onBanner(`Groupe « ${group.name} » créé.`);
    } catch (error) {
      onBanner(error instanceof Error ? error.message : "Création échouée.");
    } finally {
      setBusy(false);
    }
  }

  async function onJoin() {
    const code = joinCode.trim();
    if (!code) return;
    setBusy(true);
    try {
      const result = await joinInvite(code);
      setJoinCode("");
      setComposer("idle");
      await refreshList();
      await openGroup(result.groupId);
      onBanner(result.alreadyMember ? "Déjà membre." : "Groupe rejoint.");
    } catch (error) {
      onBanner(error instanceof Error ? error.message : "Code invalide.");
    } finally {
      setBusy(false);
    }
  }

  async function onRename() {
    if (!selectedId || !detail) return;
    const name = renameValue.trim();
    if (!name || name === detail.group.name) return;
    setBusy(true);
    try {
      const group = await renameGroup(selectedId, name);
      setDetail({ ...detail, group });
      await refreshList();
      onBanner("Renommé.");
    } catch (error) {
      onBanner(error instanceof Error ? error.message : "Renommage échoué.");
    } finally {
      setBusy(false);
    }
  }

  async function onCreateInvite() {
    if (!selectedId) return;
    setBusy(true);
    try {
      const invite = await createInvite(selectedId, { expiresInDays: 14 });
      setLastInviteLink(invite.deepLink);
      setInvites((prev) => [invite, ...prev]);
      try {
        await navigator.clipboard.writeText(invite.deepLink);
        onBanner("Lien copié.");
      } catch {
        onBanner("Invitation créée.");
      }
    } catch (error) {
      onBanner(error instanceof Error ? error.message : "Invitation échouée.");
    } finally {
      setBusy(false);
    }
  }

  async function onRevokeInvite(inviteId: string) {
    if (!selectedId) return;
    setBusy(true);
    try {
      await revokeInvite(selectedId, inviteId);
      setInvites((prev) =>
        prev.map((invite) =>
          invite.id === inviteId
            ? { ...invite, active: false, revokedAt: new Date().toISOString() }
            : invite,
        ),
      );
      onBanner("Révoquée.");
    } catch (error) {
      onBanner(error instanceof Error ? error.message : "Révocation échouée.");
    } finally {
      setBusy(false);
    }
  }

  async function onLeave() {
    if (!selectedId) return;
    setBusy(true);
    try {
      await leaveGroup(selectedId);
      setSelectedId(null);
      setDetail(null);
      const list = await refreshList();
      if (list[0]) await openGroup(list[0].id);
      onBanner("Parti.");
    } catch (error) {
      onBanner(error instanceof Error ? error.message : "Impossible de quitter.");
    } finally {
      setBusy(false);
    }
  }

  function onDelete() {
    if (!selectedId || !detail) return;
    setDeleteOpen(true);
  }

  async function confirmDelete() {
    if (!selectedId || !detail) return;
    const deletingId = selectedId;
    setBusy(true);
    try {
      await deleteGroup(deletingId);
      setGroups((current) => current.filter((group) => group.id !== deletingId));
      setSelectedId(null);
      setDetail(null);
      setDeleteOpen(false);
      try {
        const list = await refreshList();
        if (list[0]) await openGroup(list[0].id);
      } catch {
        // The deleted group is already removed locally; retry on next refresh.
      }
      onBanner("Groupe supprimé.");
    } catch (error) {
      onBanner(
        error instanceof Error ? error.message : "Suppression impossible.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function refreshLibrary() {
    if (!selectedId) return;
    const [lib, hiddenGames, groupProposals] = await Promise.all([
      fetchGroupLibrary(selectedId),
      fetchMyHiddenGames(selectedId),
      listProposals(selectedId),
    ]);
    setLibrary(lib.games);
    setHidden(hiddenGames);
    setProposals(groupProposals);
  }

  async function onConfirmPropose(appId: string) {
    if (!selectedId) return;
    setBusy(true);
    try {
      await createProposal(selectedId, appId);
      setProposeOpen(false);
      await refreshLibrary();
      onBanner("Proposition ouverte.");
    } catch (error) {
      onBanner(
        error instanceof Error ? error.message : "Proposition impossible.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onReplyProposal(
    proposalId: string,
    value: ProposalReplyValue,
  ) {
    if (!selectedId) return;
    setBusy(true);
    try {
      const next = await replyProposal(selectedId, proposalId, value);
      setProposals((current) =>
        current.map((proposal) =>
          proposal.id === next.id ? next : proposal,
        ),
      );
    } catch (error) {
      onBanner(
        error instanceof Error ? error.message : "Réponse impossible.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onCloseProposal(proposalId: string) {
    if (!selectedId) return;
    setBusy(true);
    try {
      await closeProposal(selectedId, proposalId);
      setProposals((current) =>
        current.filter((proposal) => proposal.id !== proposalId),
      );
      onBanner("Proposition classée.");
    } catch (error) {
      onBanner(
        error instanceof Error ? error.message : "Classement impossible.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onHide(game: GroupLibraryGame) {
    if (!selectedId) return;
    const mine = game.owners.find((o) => o.userId === currentUserId);
    if (!mine) {
      onBanner("Tu ne possèdes pas ce jeu.");
      return;
    }
    setBusy(true);
    try {
      await hideGameFromGroup(selectedId, game.launcher, game.externalId);
      await refreshLibrary();
    } catch (error) {
      onBanner(error instanceof Error ? error.message : "Masquage échoué.");
    } finally {
      setBusy(false);
    }
  }

  async function onUnhide(launcher: string, externalId: string) {
    if (!selectedId) return;
    setBusy(true);
    try {
      await unhideGameFromGroup(selectedId, launcher, externalId);
      await refreshLibrary();
    } catch (error) {
      onBanner(error instanceof Error ? error.message : "Réaffichage échoué.");
    } finally {
      setBusy(false);
    }
  }

  async function onLinkDiscord() {
    if (!selectedId || !discordChannelInput.trim()) return;
    setBusy(true);
    try {
      const next = await linkGroupDiscord(selectedId, discordChannelInput.trim());
      setDiscord(next);
      setDiscordChannelInput("");
      onBanner("Salon Discord lié.");
    } catch (error) {
      onBanner(
        error instanceof Error ? error.message : "Liaison Discord impossible.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onUnlinkDiscord() {
    if (!selectedId) return;
    setBusy(true);
    try {
      setDiscord(await unlinkGroupDiscord(selectedId));
      onBanner("Salon Discord délié.");
    } catch (error) {
      onBanner(
        error instanceof Error ? error.message : "Déliaison impossible.",
      );
    } finally {
      setBusy(false);
    }
  }

  const myRole = detail?.group.myRole;
  const canManage = myRole === "owner" || myRole === "admin";
  const visibleLibrary = library.filter((game) => {
    if (filter === "shared") return game.ownedCount >= 2;
    if (filter === "installed") return game.installedCount > 0;
    return true;
  });
  const sharedCount = library.filter((g) => g.ownedCount >= 2).length;

  return (
    <>
      <section
        ref={rootRef}
        className="grid min-h-[70vh] border border-rule-strong lg:grid-cols-[260px_minmax(0,1fr)]"
      >
      <aside className="border-b border-rule-strong lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between border-b border-rule-strong px-4 py-3">
          <p className="pn-data">Groupes</p>
          <div className="flex gap-2">
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center border border-paper-2 font-data text-sm leading-none text-paper hover:border-paper hover:bg-ink-raise"
              aria-label="Créer un groupe"
              onClick={() =>
                setComposer((c) => (c === "create" ? "idle" : "create"))
              }
            >
              +
            </button>
            <button
              type="button"
              className="inline-flex h-8 items-center justify-center border border-paper-2 px-2.5 font-data text-[11px] font-medium uppercase tracking-[0.14em] text-paper hover:border-paper hover:bg-ink-raise"
              onClick={() =>
                setComposer((c) => (c === "join" ? "idle" : "join"))
              }
            >
              Code
            </button>
          </div>
        </div>

        {composer !== "idle" ? (
          <div className="grid gap-2 border-b border-rule-strong p-3">
            <input
              className="border border-rule-strong bg-ink-deep px-3 py-2 font-data text-[11px] tracking-[0.1em] uppercase outline-none focus:border-paper"
              placeholder={composer === "create" ? "Nom" : "Code"}
              value={composer === "create" ? newName : joinCode}
              autoFocus
              onChange={(e) =>
                composer === "create"
                  ? setNewName(e.target.value)
                  : setJoinCode(e.target.value)
              }
              onKeyDown={(e) => {
                if (e.key === "Enter")
                  void (composer === "create" ? onCreate() : onJoin());
                if (e.key === "Escape") setComposer("idle");
              }}
            />
            <Button
              variant="primary"
              disabled={
                busy ||
                !(composer === "create" ? newName.trim() : joinCode.trim())
              }
              onClick={() =>
                void (composer === "create" ? onCreate() : onJoin())
              }
            >
              {composer === "create" ? "Créer" : "Rejoindre"}
            </Button>
          </div>
        ) : null}

        {loading ? (
          <p className="p-4 pn-data">Chargement…</p>
        ) : groups.length === 0 ? (
          <p className="p-4 pn-data">Aucun groupe</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {groups.map((group) => (
              <li key={group.id} data-channel>
                <button
                  type="button"
                  className={
                    selectedId === group.id
                      ? "pn-edge-active w-full cursor-pointer bg-ink-raise px-4 py-3.5 text-left"
                      : "w-full cursor-pointer px-4 py-3.5 text-left hover:bg-ink-raise"
                  }
                  onClick={() => void openGroup(group.id)}
                >
                  <strong className="block font-ui text-sm font-bold uppercase tracking-[0.08em]">
                    {group.name}
                  </strong>
                  <span className="pn-data mt-1 block">
                    {pad2(group.memberCount ?? 0)} joueurs
                    {group.myRole ? ` · ${roleLabel(group.myRole)}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto border-t border-rule-strong p-4">
          <p className="pn-data mb-2">En commun</p>
          <p className="pn-display text-2xl">{pad2(sharedCount)}</p>
        </div>
      </aside>

      <div className="min-w-0 p-5 md:p-6">
        {!detail ? (
          <EmptyHint title="Choisis un groupe" />
        ) : focus === "evening" ? (
          <EveningPanel
            groupId={detail.group.id}
            groupName={detail.group.name}
            currentUserId={currentUserId}
            members={detail.members}
            canOrganize={canManage}
            isOwner={myRole === "owner"}
            onBanner={onBanner}
            directDraft={directDraft}
            onDirectDraftConsumed={() => setDirectDraft(null)}
          />
        ) : (
          <div className="grid gap-6">
            <header className="flex flex-wrap items-end justify-between gap-4 border-b border-rule-strong pb-4">
              <div>
                <p className="pn-data mb-2">Groupe actif</p>
                <h2 className="pn-display text-[clamp(2rem,4vw,3.5rem)]">
                  {detail.group.name}
                </h2>
                <span className="pn-accent mt-3" />
                <div className="mt-3 flex items-center gap-3">
                  <AvatarStack people={detail.members} />
                  <span className="pn-data">
                    {pad2(detail.members.length)} membres
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={() => setProposeOpen((open) => !open)}
                >
                  {proposeOpen ? "Fermer" : "Proposer un jeu"}
                </Button>
                {canManage ? (
                  <Button
                    variant="second"
                    disabled={busy}
                    onClick={() => void onCreateInvite()}
                  >
                    Inviter
                  </Button>
                ) : null}
                <Button
                  variant="second"
                  onClick={() => setShowAdmin((v) => !v)}
                >
                  {showAdmin ? "Fermer" : "Gérer"}
                </Button>
                {myRole === "owner" ? (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void onDelete()}
                  >
                    Supprimer
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void onLeave()}
                  >
                    Quitter
                  </Button>
                )}
              </div>
            </header>

            {proposeOpen ? (
              <div className="grid gap-3 border border-rule-strong p-4">
                <p className="pn-data">Store Steam</p>
                <SteamSearch
                  disabled={busy}
                  onPick={(hit) => void onConfirmPropose(hit.appId)}
                />
              </div>
            ) : null}

            {lastInviteLink ? (
              <p className="break-all font-data text-[11px] tracking-[0.08em] text-paper-2">
                {lastInviteLink}
              </p>
            ) : null}

            {showAdmin ? (
              <div className="grid gap-4 border border-rule-strong p-4">
                {canManage ? (
                  <div className="flex flex-wrap gap-2">
                    <input
                      className="min-w-[200px] flex-1 border border-rule-strong bg-ink-deep px-3 py-2 font-data text-xs uppercase outline-none focus:border-paper"
                      value={renameValue}
                      maxLength={64}
                      onChange={(e) => setRenameValue(e.target.value)}
                    />
                    <Button
                      variant="second"
                      disabled={busy || !renameValue.trim()}
                      onClick={() => void onRename()}
                    >
                      Valider
                    </Button>
                  </div>
                ) : null}
                {canManage ? (
                  <div className="border-t border-rule-strong pt-4">
                    <p className="pn-data mb-2">Discord</p>
                    <h3 className="pn-display text-2xl">Salon du groupe</h3>
                    {!discord ? (
                      <p className="pn-data mt-3">…</p>
                    ) : !discord.configured ? (
                      <p className="mt-3 text-sm text-paper-2">
                        Bot non configuré.
                      </p>
                    ) : discord.linked ? (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <p className="pn-data text-paper">
                          {discord.guildName}
                          {discord.channelName
                            ? ` · ${discord.channelName}`
                            : ""}
                        </p>
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void onUnlinkDiscord()}
                        >
                          Délier
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-3 grid gap-3">
                        <p className="text-sm text-paper-2">
                          D’abord sur le serveur Discord, ensuite le salon.
                        </p>
                        {discord.inviteUrl ? (
                          <Button
                            variant="primary"
                            onClick={() =>
                              void openExternalUrl(discord.inviteUrl!)
                            }
                          >
                            Inviter le bot
                          </Button>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          <input
                            className="min-w-[200px] flex-1 border border-rule-strong bg-ink-deep px-3 py-2 font-data text-xs outline-none focus:border-paper"
                            placeholder="Lien ou identifiant du salon"
                            value={discordChannelInput}
                            onChange={(event) =>
                              setDiscordChannelInput(event.target.value)
                            }
                          />
                          <Button
                            variant="second"
                            disabled={busy || !discordChannelInput.trim()}
                            onClick={() => void onLinkDiscord()}
                          >
                            Lier
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
                <ul className="m-0 list-none p-0">
                  {detail.members.map((member, i) => (
                    <li key={member.id} className="pn-ledger-row">
                      <span className="pn-data text-smoke-dim">
                        {pad2(i + 1)}
                      </span>
                      <SquareAvatar
                        name={member.displayName}
                        avatarUrl={member.avatarUrl}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm">{member.displayName}</p>
                        <p className="pn-data">{roleLabel(member.role)}</p>
                      </div>
                      {canManage && member.id !== currentUserId ? (
                        <div className="flex flex-wrap gap-2">
                          {myRole === "owner" && member.role === "member" ? (
                            <button
                              type="button"
                              className="pn-data hover:text-paper"
                              disabled={busy}
                              onClick={() =>
                                void setMemberRole(
                                  selectedId!,
                                  member.id,
                                  "admin",
                                )
                                  .then(() => openGroup(selectedId!))
                                  .catch((e: Error) => onBanner(e.message))
                              }
                            >
                              Promouvoir
                            </button>
                          ) : null}
                          {myRole === "owner" && member.role === "admin" ? (
                            <button
                              type="button"
                              className="pn-data hover:text-paper"
                              disabled={busy}
                              onClick={() =>
                                void setMemberRole(
                                  selectedId!,
                                  member.id,
                                  "member",
                                )
                                  .then(() => openGroup(selectedId!))
                                  .catch((e: Error) => onBanner(e.message))
                              }
                            >
                              Membre
                            </button>
                          ) : null}
                          {(myRole === "owner" && member.role !== "owner") ||
                          (myRole === "admin" && member.role === "member") ? (
                            <button
                              type="button"
                              className="pn-data hover:text-paper"
                              disabled={busy}
                              onClick={() =>
                                void removeMember(selectedId!, member.id)
                                  .then(() => openGroup(selectedId!))
                                  .catch((e: Error) => onBanner(e.message))
                              }
                            >
                              Retirer
                            </button>
                          ) : null}
                          {myRole === "owner" && member.role !== "owner" ? (
                            <button
                              type="button"
                              className="pn-data hover:text-paper"
                              disabled={busy}
                              onClick={() =>
                                void transferOwnership(selectedId!, member.id)
                                  .then(() => openGroup(selectedId!))
                                  .catch((e: Error) => onBanner(e.message))
                              }
                            >
                              Céder
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {canManage && invites.length > 0 ? (
                  <ul className="m-0 list-none p-0">
                    {invites.map((invite) => (
                      <li
                        key={invite.id}
                        className="flex flex-wrap items-center justify-between gap-2 border-b border-rule py-2"
                      >
                        <code className="font-data text-[11px]">
                          {invite.code}
                        </code>
                        {invite.active !== false && !invite.revokedAt ? (
                          <button
                            type="button"
                            className="pn-data hover:text-paper"
                            disabled={busy}
                            onClick={() => void onRevokeInvite(invite.id)}
                          >
                            Révoquer
                          </button>
                        ) : (
                          <span className="pn-data">Révoquée</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <ProposalsPanel
              proposals={proposals}
              busy={busy}
              onReply={(proposalId, value) =>
                void onReplyProposal(proposalId, value)
              }
              onClose={(proposalId) => void onCloseProposal(proposalId)}
              onCreateEvening={(proposal) => {
                setDirectDraft({
                  appId: proposal.externalId,
                  name: proposal.name,
                  coverUrl: proposal.coverUrl,
                  steamUrl: proposal.steamUrl,
                  priceLabel: proposal.priceLabel ?? undefined,
                });
                onRequestEvening?.();
              }}
            />

            <div>
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
                <h3 className="pn-display text-2xl">Jeux du groupe</h3>
                <div className="flex flex-wrap gap-3">
                  {(
                    [
                      ["all", "Tous"],
                      ["shared", "Commun"],
                      ["installed", "Installés"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className={
                        filter === key
                          ? "bg-paper px-2 py-1 font-ui text-[11px] font-bold uppercase tracking-[0.14em] text-ink-deep"
                          : "pn-data hover:text-paper"
                      }
                      onClick={() => setFilter(key)}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="pn-data hover:text-paper"
                    disabled={busy}
                    onClick={() => void refreshLibrary()}
                  >
                    Sync
                  </button>
                </div>
              </div>

              {visibleLibrary.length === 0 ? (
                <EmptyHint title="Rien ici" body="Scannez vos bibliothèques." />
              ) : (
                <PosterGrid
                  label="Bibliothèque du groupe"
                  density="compact"
                  animateKey={`${filter}:${visibleLibrary.length}`}
                >
                  {visibleLibrary.map((game, index) => {
                    const mine = game.owners.find(
                      (o) => o.userId === currentUserId,
                    );
                    return (
                      <div key={game.key} role="listitem">
                        <GamePoster
                          name={game.name}
                          launcher={game.launcher}
                          externalId={game.externalId}
                          coverUrl={game.coverUrl}
                          priority={index < 24}
                          subtitle={`${pad2(game.ownedCount)}/${pad2(game.memberCount)} · ${game.launcher}`}
                          footer={
                            mine ? (
                              <button
                                type="button"
                                className="pn-data mt-1 hover:text-paper"
                                disabled={busy}
                                onClick={() => void onHide(game)}
                              >
                                Masquer
                              </button>
                            ) : null
                          }
                        />
                      </div>
                    );
                  })}
                </PosterGrid>
              )}

              {hidden.length > 0 ? (
                <>
                  <p className="pn-data mt-8 mb-3">
                    Masqués · {pad2(hidden.length)}
                  </p>
                  <PosterGrid
                    label="Jeux masqués"
                    density="compact"
                    animateKey={`hidden:${hidden.length}`}
                  >
                    {hidden.map((game) => (
                      <div
                        key={`${game.launcher}:${game.externalId}`}
                        role="listitem"
                      >
                        <GamePoster
                          name={game.name}
                          launcher={game.launcher}
                          externalId={game.externalId}
                          footer={
                            <button
                              type="button"
                              className="pn-data mt-1 hover:text-paper"
                              disabled={busy}
                              onClick={() =>
                                void onUnhide(game.launcher, game.externalId)
                              }
                            >
                              Réafficher
                            </button>
                          }
                        />
                      </div>
                    ))}
                  </PosterGrid>
                </>
              ) : null}
            </div>
          </div>
        )}
      </div>
      </section>
      {deleteOpen && detail ? (
        <ConfirmDialog
          title="Supprimer le groupe ?"
          confirmLabel="Supprimer"
          busy={busy}
          onConfirm={() => void confirmDelete()}
          onCancel={() => {
            if (!busy) setDeleteOpen(false);
          }}
        >
          {`Le groupe « ${detail.group.name} » et ses soirées seront supprimés.`}
        </ConfirmDialog>
      ) : null}
    </>
  );
}
