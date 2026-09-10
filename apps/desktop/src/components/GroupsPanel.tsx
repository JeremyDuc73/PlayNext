import { useEffect, useRef, useState } from "react";
import { EveningPanel } from "./EveningPanel";
import { CalendarPanel } from "./CalendarPanel";
import { ProposalsPanel } from "./ProposalsPanel";
import { GroupSidebar } from "./groups/GroupSidebar";
import { GroupAdminSection } from "./groups/GroupAdminSection";
import { InviteModal } from "./groups/InviteModal";
import {
  GroupLibrarySection,
  type LibraryFilter,
} from "./groups/GroupLibrarySection";
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
import { useAppStore } from "../stores/useAppStore";
import { pad2 } from "../lib/format";
import { staggerIn, useGSAP } from "../lib/motion";
import { AvatarStack } from "../ui/AvatarStack";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { EmptyHint } from "../ui/EmptyHint";
import { SteamSearch } from "../ui/SteamSearch";

type Props = {
  enabled: boolean;
  focus: "group" | "evening" | "calendar";
  currentUserId: string;
  pendingInviteCode: string | null;
  onPendingInviteConsumed: () => void;
  onBanner?: (message: string) => void;
  onRequestEvening?: () => void;
  focusGroupId?: string | null;
};

export function GroupsPanel({
  enabled,
  focus,
  currentUserId,
  pendingInviteCode,
  onPendingInviteConsumed,
  onBanner: onBannerProp,
  onRequestEvening,
  focusGroupId = null,
}: Props) {
  const storeOpenEvening = useAppStore((s) => s.openEvening);
  const storeOpenDirectDraft = useAppStore((s) => s.openDirectDraft);
  const storeSelectedGroupId = useAppStore((s) => s.selectedGroupId);
  const setStoreSelectedGroupId = useAppStore((s) => s.setSelectedGroupId);
  const storeNotify = useAppStore((s) => s.notify);
  const onBanner = onBannerProp ?? storeNotify;

  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => storeSelectedGroupId,
  );
  const [detail, setDetail] = useState<{
    group: GroupSummary;
    members: GroupMember[];
  } | null>(null);
  const [library, setLibrary] = useState<GroupLibraryGame[]>([]);
  const [hidden, setHidden] = useState<HiddenGroupGame[]>([]);
  const [proposals, setProposals] = useState<GameProposal[]>([]);
  const [proposeOpen, setProposeOpen] = useState(false);
  const [invites, setInvites] = useState<GroupInvite[]>([]);
  const [newName, setNewName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [composer, setComposer] = useState<"idle" | "create" | "join">("idle");
  const [groupTab, setGroupTab] = useState<"library" | "proposals" | "admin">(
    "library",
  );
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
    setStoreSelectedGroupId(groupId);
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
    if (groupTab !== "admin" || !can || !selectedId) {
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
  }, [groupTab, selectedId, detail?.group.myRole]);

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

  const activeInvite = invites.find(
    (inv) =>
      inv.active !== false &&
      !inv.revokedAt &&
      (!inv.expiresAt || new Date(inv.expiresAt) > new Date()),
  );
  const currentInviteCode = activeInvite?.code ?? null;
  const currentInviteLink = activeInvite?.deepLink ?? lastInviteLink;

  async function onOpenInviteModal() {
    if (!selectedId) return;
    setInviteModalOpen(true);
    if (!activeInvite) {
      await onCreateInvite();
    }
  }

  async function onCreateInvite() {
    if (!selectedId) return;
    setBusy(true);
    try {
      const invite = await createInvite(selectedId, { expiresInDays: 14 });
      setLastInviteLink(invite.deepLink);
      setInvites((prev) => [invite, ...prev]);
      setInviteModalOpen(true);
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
      onBanner("Proposition annulée.");
    } catch (error) {
      onBanner(
        error instanceof Error ? error.message : "Annulation impossible.",
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
      <GroupSidebar
        groups={groups}
        selectedId={selectedId}
        onSelectGroup={(id) => void openGroup(id)}
        sharedCount={sharedCount}
        loading={loading}
        busy={busy}
        composer={composer}
        onToggleComposer={(mode) =>
          setComposer((c) => (c === mode ? "idle" : mode))
        }
        newName={newName}
        onNewNameChange={setNewName}
        joinCode={joinCode}
        onJoinCodeChange={setJoinCode}
        onCreate={() => void onCreate()}
        onJoin={() => void onJoin()}
        onCancelComposer={() => setComposer("idle")}
      />

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
          />
        ) : focus === "calendar" ? (
          <CalendarPanel
            groupId={detail.group.id}
            groupName={detail.group.name}
            onBanner={onBanner}
            onOpenEvening={(eveningId) => {
              storeOpenEvening(eveningId);
              onRequestEvening?.();
            }}
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
                    {pad2(detail.members.length)} membres · {pad2(sharedCount)} en commun
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {canManage ? (
                  <Button
                    variant="primary"
                    disabled={busy}
                    onClick={() => void onOpenInviteModal()}
                  >
                    Inviter
                  </Button>
                ) : null}
              </div>
            </header>

            <nav className="flex flex-wrap gap-2 border-b border-rule-strong pb-3" aria-label="Sections du groupe">
              <button
                type="button"
                className={
                  groupTab === "library"
                    ? "border border-paper bg-paper px-4 py-2 font-ui text-xs font-bold uppercase tracking-[0.14em] text-ink-deep"
                    : "border border-rule px-4 py-2 font-ui text-xs uppercase tracking-[0.14em] text-smoke hover:border-paper hover:text-paper"
                }
                onClick={() => setGroupTab("library")}
              >
                Jeux du groupe ({pad2(library.length)})
              </button>
              <button
                type="button"
                className={
                  groupTab === "proposals"
                    ? "border border-paper bg-paper px-4 py-2 font-ui text-xs font-bold uppercase tracking-[0.14em] text-ink-deep"
                    : "border border-rule px-4 py-2 font-ui text-xs uppercase tracking-[0.14em] text-smoke hover:border-paper hover:text-paper"
                }
                onClick={() => setGroupTab("proposals")}
              >
                Propositions {proposals.length > 0 ? `(${pad2(proposals.length)})` : ""}
              </button>
              <button
                type="button"
                className={
                  groupTab === "admin"
                    ? "border border-paper bg-paper px-4 py-2 font-ui text-xs font-bold uppercase tracking-[0.14em] text-ink-deep"
                    : "border border-rule px-4 py-2 font-ui text-xs uppercase tracking-[0.14em] text-smoke hover:border-paper hover:text-paper"
                }
                onClick={() => setGroupTab("admin")}
              >
                Membres & Salon
              </button>
            </nav>

            {groupTab === "library" ? (
              <GroupLibrarySection
                filter={filter}
                onFilterChange={setFilter}
                onRefreshLibrary={() => void refreshLibrary()}
                visibleLibrary={visibleLibrary}
                currentUserId={currentUserId}
                onHide={(game) => void onHide(game)}
                hidden={hidden}
                onUnhide={(launcher, externalId) =>
                  void onUnhide(launcher, externalId)
                }
                busy={busy}
              />
            ) : groupTab === "proposals" ? (
              <div className="grid gap-6">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-rule-strong pb-4">
                  <div>
                    <h3 className="pn-display text-2xl">Propositions Steam</h3>
                    <p className="pn-data mt-1 text-smoke">
                      Trouvez vos prochains jeux ensemble et votez avant d’acheter.
                    </p>
                  </div>
                  <Button
                    variant={proposeOpen ? "second" : "primary"}
                    disabled={busy}
                    onClick={() => setProposeOpen((open) => !open)}
                  >
                    {proposeOpen ? "Fermer la recherche" : "+ Proposer un jeu"}
                  </Button>
                </div>

                {proposeOpen ? (
                  <div className="border border-rule-strong bg-ink-deep p-4">
                    <p className="pn-data mb-3 text-paper">Rechercher sur le Store Steam</p>
                    <SteamSearch
                      disabled={busy}
                      onPick={(hit) => {
                        void onConfirmPropose(hit.appId);
                        setProposeOpen(false);
                      }}
                    />
                  </div>
                ) : null}

                {proposals.length === 0 && !proposeOpen ? (
                  <EmptyHint
                    title="Pas de proposition"
                    body="Aucune proposition en cours. Propose un jeu Steam à ta bande !"
                  />
                ) : (
                  <ProposalsPanel
                    proposals={proposals}
                    busy={busy}
                    onReply={(proposalId, value) =>
                      void onReplyProposal(proposalId, value)
                    }
                    onClose={(proposalId) => void onCloseProposal(proposalId)}
                    onCreateEvening={(proposal) => {
                      storeOpenDirectDraft({
                        appId: proposal.externalId,
                        name: proposal.name,
                        coverUrl: proposal.coverUrl,
                        steamUrl: proposal.steamUrl,
                        priceLabel: proposal.priceLabel ?? undefined,
                      });
                      onRequestEvening?.();
                    }}
                  />
                )}
              </div>
            ) : (
              <GroupAdminSection
                canManage={canManage}
                renameValue={renameValue}
                onRenameChange={setRenameValue}
                onRename={() => void onRename()}
                discord={discord}
                discordChannelInput={discordChannelInput}
                onDiscordChannelInputChange={setDiscordChannelInput}
                onLinkDiscord={() => void onLinkDiscord()}
                onUnlinkDiscord={() => void onUnlinkDiscord()}
                members={detail.members}
                currentUserId={currentUserId}
                myRole={myRole ?? null}
                onSetMemberRole={(userId, role) =>
                  void setMemberRole(selectedId!, userId, role)
                    .then(() => openGroup(selectedId!))
                    .catch((e: Error) => onBanner(e.message))
                }
                onRemoveMember={(userId) =>
                  void removeMember(selectedId!, userId)
                    .then(() => openGroup(selectedId!))
                    .catch((e: Error) => onBanner(e.message))
                }
                onTransferOwnership={(userId) =>
                  void transferOwnership(selectedId!, userId)
                    .then(() => openGroup(selectedId!))
                    .catch((e: Error) => onBanner(e.message))
                }
                invites={invites}
                onCreateInvite={() => void onOpenInviteModal()}
                lastInviteLink={lastInviteLink}
                onRevokeInvite={(inviteId) => void onRevokeInvite(inviteId)}
                onLeave={() => void onLeave()}
                onDelete={() => void onDelete()}
                busy={busy}
              />
            )}
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
      <InviteModal
        isOpen={inviteModalOpen}
        groupName={detail?.group.name ?? ""}
        code={currentInviteCode}
        link={currentInviteLink}
        busy={busy}
        onClose={() => setInviteModalOpen(false)}
        onGenerateNew={() => void onCreateInvite()}
      />
    </>
  );
}
