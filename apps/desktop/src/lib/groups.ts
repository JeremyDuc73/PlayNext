import { apiFetch } from "./api";

export type GroupRole = "owner" | "admin" | "member";

export type GroupSummary = {
  id: string;
  name: string;
  imageUrl: string | null;
  ownerId: string;
  memberCount?: number;
  myRole?: GroupRole;
  createdAt: string;
  updatedAt: string;
};

export type GroupMember = {
  id: string;
  discordId: string;
  username: string;
  globalName: string | null;
  avatarUrl: string | null;
  displayName: string;
  role: GroupRole;
  joinedAt: string;
};

export type GroupInvite = {
  id: string;
  code: string;
  deepLink: string;
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
  revokedAt?: string | null;
  active?: boolean;
  createdAt: string;
};

export type InvitePreview = {
  code: string;
  deepLink: string;
  group: {
    id: string;
    name: string;
    imageUrl: string | null;
    memberCount: number;
  };
  alreadyMember: boolean;
  joinable: boolean;
  reason: string | null;
};

export type GroupLibraryGame = {
  key: string;
  launcher: string;
  externalId: string;
  name: string;
  ownedCount: number;
  installedCount: number;
  memberCount: number;
  coverUrl?: string | null;
  owners: Array<{
    userId: string;
    displayName: string;
    username: string;
    avatarUrl: string | null;
    installed: boolean;
    launchable: boolean;
  }>;
  hiddenByMe: boolean;
};

export type HiddenGroupGame = {
  launcher: string;
  externalId: string;
  name: string;
  hiddenAt: string;
};

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
    message?: string;
  } | null;
  return body?.message ?? body?.error ?? `http_${response.status}`;
}

export async function listGroups(): Promise<GroupSummary[]> {
  const response = await apiFetch("/groups");
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as {
    ok: boolean;
    groups: GroupSummary[];
  };
  return data.groups;
}

export async function createGroup(name: string): Promise<GroupSummary> {
  const response = await apiFetch("/groups", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as {
    ok: boolean;
    group: GroupSummary;
  };
  return data.group;
}

export async function fetchGroup(groupId: string): Promise<{
  group: GroupSummary;
  members: GroupMember[];
}> {
  const response = await apiFetch(`/groups/${groupId}`);
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as {
    ok: boolean;
    group: GroupSummary;
    members: GroupMember[];
  };
  return { group: data.group, members: data.members };
}

export async function renameGroup(
  groupId: string,
  name: string,
): Promise<GroupSummary> {
  const response = await apiFetch(`/groups/${groupId}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as {
    ok: boolean;
    group: GroupSummary;
  };
  return data.group;
}

export async function deleteGroup(groupId: string): Promise<void> {
  const response = await apiFetch(`/groups/${groupId}`, { method: "DELETE" });
  if (!response.ok) throw new Error(await readError(response));
}

export async function leaveGroup(groupId: string): Promise<void> {
  const response = await apiFetch(`/groups/${groupId}/leave`, {
    method: "POST",
  });
  if (!response.ok) throw new Error(await readError(response));
}

export async function transferOwnership(
  groupId: string,
  userId: string,
): Promise<void> {
  const response = await apiFetch(`/groups/${groupId}/transfer`, {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
  if (!response.ok) throw new Error(await readError(response));
}

export async function setMemberRole(
  groupId: string,
  memberId: string,
  role: "admin" | "member",
): Promise<void> {
  const response = await apiFetch(`/groups/${groupId}/members/${memberId}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
  if (!response.ok) throw new Error(await readError(response));
}

export async function removeMember(
  groupId: string,
  memberId: string,
): Promise<void> {
  const response = await apiFetch(`/groups/${groupId}/members/${memberId}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(await readError(response));
}

export async function createInvite(
  groupId: string,
  opts?: { expiresInDays?: number; maxUses?: number | null },
): Promise<GroupInvite> {
  const response = await apiFetch(`/groups/${groupId}/invites`, {
    method: "POST",
    body: JSON.stringify(opts ?? { expiresInDays: 14 }),
  });
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as {
    ok: boolean;
    invite: GroupInvite;
  };
  return data.invite;
}

export async function listInvites(groupId: string): Promise<GroupInvite[]> {
  const response = await apiFetch(`/groups/${groupId}/invites`);
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as {
    ok: boolean;
    invites: GroupInvite[];
  };
  return data.invites;
}

export async function revokeInvite(
  groupId: string,
  inviteId: string,
): Promise<void> {
  const response = await apiFetch(`/groups/${groupId}/invites/${inviteId}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(await readError(response));
}

export async function previewInvite(code: string): Promise<InvitePreview> {
  const response = await apiFetch(`/invites/${encodeURIComponent(code)}`);
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as {
    ok: boolean;
    invite: InvitePreview;
  };
  return data.invite;
}

export async function joinInvite(
  code: string,
): Promise<{ groupId: string; alreadyMember: boolean }> {
  const response = await apiFetch(
    `/invites/${encodeURIComponent(code)}/join`,
    { method: "POST" },
  );
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as {
    ok: boolean;
    groupId: string;
    alreadyMember: boolean;
  };
  return { groupId: data.groupId, alreadyMember: data.alreadyMember };
}

export async function fetchGroupLibrary(groupId: string): Promise<{
  memberCount: number;
  gameCount: number;
  games: GroupLibraryGame[];
  myHiddenCount: number;
}> {
  const response = await apiFetch(`/groups/${groupId}/library`);
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as {
    ok: boolean;
    memberCount: number;
    gameCount: number;
    games: GroupLibraryGame[];
    myHiddenCount: number;
  };
  return data;
}

export async function fetchMyHiddenGames(
  groupId: string,
): Promise<HiddenGroupGame[]> {
  const response = await apiFetch(`/groups/${groupId}/library/hidden`);
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as {
    ok: boolean;
    games: HiddenGroupGame[];
  };
  return data.games;
}

export async function hideGameFromGroup(
  groupId: string,
  launcher: string,
  externalId: string,
): Promise<void> {
  const response = await apiFetch(`/groups/${groupId}/library/hide`, {
    method: "POST",
    body: JSON.stringify({ launcher, externalId }),
  });
  if (!response.ok) throw new Error(await readError(response));
}

export async function unhideGameFromGroup(
  groupId: string,
  launcher: string,
  externalId: string,
): Promise<void> {
  const response = await apiFetch(`/groups/${groupId}/library/unhide`, {
    method: "POST",
    body: JSON.stringify({ launcher, externalId }),
  });
  if (!response.ok) throw new Error(await readError(response));
}

export type GroupDiscord = {
  configured: boolean;
  inviteUrl: string | null;
  linked: boolean;
  guildId: string | null;
  guildName: string | null;
  channelId: string | null;
  channelName: string | null;
};

export async function fetchGroupDiscord(
  groupId: string,
): Promise<GroupDiscord> {
  const response = await apiFetch(`/groups/${groupId}/discord`);
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as { discord: GroupDiscord };
  return data.discord;
}

export async function linkGroupDiscord(
  groupId: string,
  channelId: string,
): Promise<GroupDiscord> {
  const response = await apiFetch(`/groups/${groupId}/discord`, {
    method: "PUT",
    body: JSON.stringify({ channelId }),
  });
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as { discord: GroupDiscord };
  return data.discord;
}

export async function unlinkGroupDiscord(
  groupId: string,
): Promise<GroupDiscord> {
  const response = await apiFetch(`/groups/${groupId}/discord`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as { discord: GroupDiscord };
  return data.discord;
}

export function roleLabel(role: GroupRole): string {
  switch (role) {
    case "owner":
      return "Propriétaire";
    case "admin":
      return "Administrateur";
    case "member":
      return "Membre";
  }
}
