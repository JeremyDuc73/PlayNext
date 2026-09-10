import {
  type GroupDiscord,
  type GroupInvite,
  type GroupMember,
  roleLabel,
} from "../../lib/groups";
import { pad2 } from "../../lib/format";
import { openExternalUrl } from "../../lib/desktop-auth";
import { Button } from "../../ui/Button";
import { SquareAvatar } from "../../ui/SquareAvatar";

export type GroupAdminSectionProps = {
  canManage: boolean;
  renameValue: string;
  onRenameChange: (v: string) => void;
  onRename: () => void;
  discord: GroupDiscord | null;
  discordChannelInput: string;
  onDiscordChannelInputChange: (v: string) => void;
  onLinkDiscord: () => void;
  onUnlinkDiscord: () => void;
  members: GroupMember[];
  currentUserId: string;
  myRole: string | null;
  onSetMemberRole: (userId: string, role: "admin" | "member") => void;
  onRemoveMember: (userId: string) => void;
  onTransferOwnership: (userId: string) => void;
  invites: GroupInvite[];
  onCreateInvite?: () => void;
  lastInviteLink?: string | null;
  onRevokeInvite: (inviteId: string) => void;
  onLeave?: () => void;
  onDelete?: () => void;
  busy: boolean;
};

export function GroupAdminSection({
  canManage,
  renameValue,
  onRenameChange,
  onRename,
  discord,
  discordChannelInput,
  onDiscordChannelInputChange,
  onLinkDiscord,
  onUnlinkDiscord,
  members,
  currentUserId,
  myRole,
  onSetMemberRole,
  onRemoveMember,
  onTransferOwnership,
  invites,
  onCreateInvite,
  lastInviteLink,
  onRevokeInvite,
  onLeave,
  onDelete,
  busy,
}: GroupAdminSectionProps) {
  return (
    <div className="grid max-w-4xl gap-8">
      {/* 1. Inviter */}
      {canManage && onCreateInvite ? (
        <section className="border border-rule-strong p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
            <div>
              <p className="pn-data mb-1">Accès</p>
              <h4 className="font-ui text-base font-bold uppercase tracking-[0.08em] text-paper">
                Inviter un ami
              </h4>
            </div>
            <Button
              variant="primary"
              disabled={busy}
              onClick={onCreateInvite}
            >
              Générer une invitation
            </Button>
          </div>

          {lastInviteLink ? (
            <div className="mt-3 border border-rule bg-ink-deep p-3">
              <p className="pn-data mb-1 text-smoke">Dernier lien généré (expire sous 14 jours) :</p>
              <p className="break-all font-data text-xs tracking-[0.08em] text-paper selection:bg-paper selection:text-ink-deep">
                {lastInviteLink}
              </p>
            </div>
          ) : null}

          {invites.length > 0 ? (
            <ul className="m-0 mt-3 list-none p-0">
              {invites.map((invite) => (
                <li
                  key={invite.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-rule py-2 last:border-b-0"
                >
                  <code className="font-data text-xs text-paper">{invite.code}</code>
                  {invite.active !== false && !invite.revokedAt ? (
                    <button
                      type="button"
                      className="pn-data text-smoke hover:text-veto"
                      disabled={busy}
                      onClick={() => onRevokeInvite(invite.id)}
                    >
                      Révoquer
                    </button>
                  ) : (
                    <span className="pn-data text-smoke-dim">Révoquée</span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {/* 2. Discord */}
      {canManage ? (
        <section className="border border-rule-strong p-5">
          <div className="border-b border-rule pb-3">
            <p className="pn-data mb-1">Discord</p>
            <h4 className="font-ui text-base font-bold uppercase tracking-[0.08em] text-paper">
              Salon d’annonces
            </h4>
          </div>

          {!discord ? (
            <p className="pn-data mt-3">Chargement…</p>
          ) : !discord.configured ? (
            <p className="mt-3 text-sm text-smoke">Bot non configuré côté serveur.</p>
          ) : discord.linked ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-ui text-sm font-bold uppercase text-paper">
                  {discord.guildName}
                  {discord.channelName ? ` · #${discord.channelName}` : ""}
                </p>
                <p className="pn-data mt-0.5 text-smoke">Les annonces de soirées et votes y sont envoyées.</p>
              </div>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={onUnlinkDiscord}
              >
                Délier
              </Button>
            </div>
          ) : (
            <div className="mt-3 grid gap-3">
              <p className="text-sm text-smoke">
                1. Invite le bot sur ton serveur Discord · 2. Colle le lien ou l'ID de ton salon.
              </p>
              {discord.inviteUrl ? (
                <div>
                  <Button
                    variant="second"
                    onClick={() => void openExternalUrl(discord.inviteUrl!)}
                  >
                    Inviter le bot sur Discord ↗
                  </Button>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <input
                  className="min-w-[220px] flex-1 border border-rule-strong bg-ink-deep px-3 py-2 font-data text-xs outline-none focus:border-paper"
                  placeholder="Lien du salon ou identifiant Discord"
                  value={discordChannelInput}
                  onChange={(event) =>
                    onDiscordChannelInputChange(event.target.value)
                  }
                />
                <Button
                  variant="primary"
                  disabled={busy || !discordChannelInput.trim()}
                  onClick={onLinkDiscord}
                >
                  Lier le salon
                </Button>
              </div>
            </div>
          )}
        </section>
      ) : null}

      {/* 3. Renommer */}
      {canManage ? (
        <section className="border border-rule-strong p-5">
          <p className="pn-data mb-1">Paramètres</p>
          <h4 className="font-ui text-base font-bold uppercase tracking-[0.08em] text-paper">
            Nom du groupe
          </h4>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              className="min-w-[220px] flex-1 border border-rule-strong bg-ink-deep px-3 py-2 font-data text-xs uppercase outline-none focus:border-paper"
              value={renameValue}
              maxLength={64}
              onChange={(e) => onRenameChange(e.target.value)}
            />
            <Button
              variant="second"
              disabled={busy || !renameValue.trim()}
              onClick={onRename}
            >
              Renommer
            </Button>
          </div>
        </section>
      ) : null}

      {/* 4. Membres & Rôles */}
      <section className="border border-rule-strong p-5">
        <div className="border-b border-rule pb-3">
          <p className="pn-data mb-1">Membres ({pad2(members.length)})</p>
          <h4 className="font-ui text-base font-bold uppercase tracking-[0.08em] text-paper">
            Registre et permissions
          </h4>
        </div>
        <ul className="m-0 mt-3 list-none p-0">
          {members.map((member, i) => (
            <li key={member.id} className="pn-ledger-row">
              <span className="pn-data text-smoke-dim">{pad2(i + 1)}</span>
              <SquareAvatar
                name={member.displayName}
                avatarUrl={member.avatarUrl}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold uppercase text-paper">
                  {member.displayName}
                </p>
                <p className="pn-data text-smoke">{roleLabel(member.role)}</p>
              </div>
              {canManage && member.id !== currentUserId ? (
                <div className="flex flex-wrap gap-3">
                  {myRole === "owner" && member.role === "member" ? (
                    <button
                      type="button"
                      className="pn-data text-smoke hover:text-paper"
                      disabled={busy}
                      onClick={() => onSetMemberRole(member.id, "admin")}
                    >
                      Promouvoir admin
                    </button>
                  ) : null}
                  {myRole === "owner" && member.role === "admin" ? (
                    <button
                      type="button"
                      className="pn-data text-smoke hover:text-paper"
                      disabled={busy}
                      onClick={() => onSetMemberRole(member.id, "member")}
                    >
                      Rétrograder membre
                    </button>
                  ) : null}
                  {(myRole === "owner" && member.role !== "owner") ||
                  (myRole === "admin" && member.role === "member") ? (
                    <button
                      type="button"
                      className="pn-data text-smoke hover:text-veto"
                      disabled={busy}
                      onClick={() => onRemoveMember(member.id)}
                    >
                      Retirer
                    </button>
                  ) : null}
                  {myRole === "owner" && member.role !== "owner" ? (
                    <button
                      type="button"
                      className="pn-data text-smoke hover:text-paper"
                      disabled={busy}
                      onClick={() => onTransferOwnership(member.id)}
                    >
                      Céder la propriété
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {/* 5. Danger zone */}
      <section className="border border-rule-strong p-5">
        <p className="pn-data mb-1 text-smoke">Action irréversible</p>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h4 className="font-ui text-base font-bold uppercase tracking-[0.08em] text-paper">
              {myRole === "owner" ? "Supprimer le groupe" : "Quitter le groupe"}
            </h4>
            <p className="pn-data mt-1 text-smoke">
              {myRole === "owner"
                ? "Supprime définitivement le groupe, ses membres et toutes ses soirées."
                : "Tu n'auras plus accès aux bibliothèques et soirées de ce groupe."}
            </p>
          </div>
          {myRole === "owner" && onDelete ? (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={onDelete}
            >
              Supprimer le groupe
            </Button>
          ) : onLeave ? (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={onLeave}
            >
              Quitter le groupe
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
