const API_URL =
  import.meta.env.VITE_API_URL ?? "https://api.playnext.jeremyduc.dev";
const SESSION_KEY = "playnext_session";

export type User = {
  id: string;
  discordId: string;
  username: string;
  globalName: string | null;
  avatarUrl: string | null;
  displayName: string;
};

export function getApiUrl(): string {
  return API_URL;
}

export function getStoredSessionToken(): string | null {
  return localStorage.getItem(SESSION_KEY);
}

export function setStoredSessionToken(token: string | null): void {
  if (token) {
    localStorage.setItem(SESSION_KEY, token);
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

function authHeaders(): HeadersInit {
  const token = getStoredSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const auth = authHeaders();
  for (const [key, value] of Object.entries(auth)) {
    headers.set(key, value);
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
}

export async function fetchMe(): Promise<User | null> {
  const response = await apiFetch("/auth/me");
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = (await response.json()) as { ok: boolean; user: User };
  return data.user;
}

export async function exchangeHandoff(code: string): Promise<User> {
  const response = await apiFetch("/auth/handoff/exchange", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  if (!response.ok) {
    throw new Error(`handoff_failed_${response.status}`);
  }
  const data = (await response.json()) as {
    ok: boolean;
    token: string;
    user: User;
  };
  setStoredSessionToken(data.token);
  return data.user;
}

export async function logoutRequest(): Promise<void> {
  await apiFetch("/auth/logout", { method: "POST" });
  setStoredSessionToken(null);
}

export type LibraryGame = {
  id: string;
  launcher: string;
  externalId: string;
  name: string;
  installed: boolean;
  owned: boolean;
  launchable: boolean;
  coverUrl?: string | null;
  year?: number | null;
};

export type SteamGamePayload = {
  launcher: "steam";
  externalId: string;
  name: string;
  installed: boolean;
  owned: boolean;
  launchable: boolean;
};

export async function syncSteamLibrary(
  games: SteamGamePayload[],
  steamId?: string | null,
): Promise<{
  synced: number;
  installed: number;
  ownedEnriched: boolean;
  ownedCount: number;
  hint?: string;
}> {
  const response = await apiFetch("/library/sync", {
    method: "POST",
    body: JSON.stringify({
      source: "steam",
      games,
      ...(steamId ? { steamId } : {}),
    }),
  });
  if (!response.ok) {
    throw new Error(`sync_failed_${response.status}`);
  }
  const data = (await response.json()) as {
    ok: boolean;
    synced: number;
    installed: number;
    ownedEnriched?: boolean;
    ownedCount?: number;
    hint?: string;
  };
  return {
    synced: data.synced,
    installed: data.installed,
    ownedEnriched: Boolean(data.ownedEnriched),
    ownedCount: data.ownedCount ?? 0,
    hint: data.hint,
  };
}

export async function fetchMyLibrary(): Promise<LibraryGame[]> {
  const response = await apiFetch("/library/me");
  if (response.status === 401) return [];
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = (await response.json()) as { ok: boolean; games: LibraryGame[] };
  return data.games;
}

export type ManualCatalogGame = {
  igdbId: number;
  name: string;
  coverImageId: string | null;
  coverUrl: string | null;
  year: number | null;
};

export async function searchManualGames(
  query: string,
): Promise<ManualCatalogGame[]> {
  const response = await apiFetch("/library/manual/search", {
    method: "POST",
    body: JSON.stringify({ query }),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      message?: string;
      error?: string;
    } | null;
    throw new Error(data?.message ?? data?.error ?? `HTTP ${response.status}`);
  }
  const data = (await response.json()) as {
    results: ManualCatalogGame[];
  };
  return data.results;
}

export async function addManualGame(igdbId: number): Promise<void> {
  const response = await apiFetch("/library/manual", {
    method: "POST",
    body: JSON.stringify({ igdbId }),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      message?: string;
      error?: string;
    } | null;
    throw new Error(data?.message ?? data?.error ?? `HTTP ${response.status}`);
  }
}

export type MicrosoftStatus = {
  configured: boolean;
  linked: boolean;
  xuid: string | null;
};

export async function fetchMicrosoftStatus(): Promise<MicrosoftStatus> {
  const response = await apiFetch("/auth/microsoft/status");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = (await response.json()) as {
    ok: boolean;
    configured: boolean;
    linked: boolean;
    xuid: string | null;
  };
  return {
    configured: data.configured,
    linked: data.linked,
    xuid: data.xuid,
  };
}

export async function startMicrosoftLink(
  client: "desktop" | "web",
): Promise<string> {
  const response = await apiFetch("/auth/microsoft/start", {
    method: "POST",
    body: JSON.stringify({ client }),
  });
  if (!response.ok) {
    throw new Error(`microsoft_start_${response.status}`);
  }
  const data = (await response.json()) as { ok: boolean; url: string };
  return data.url;
}

export async function disconnectMicrosoft(): Promise<void> {
  const response = await apiFetch("/auth/microsoft/disconnect", {
    method: "POST",
  });
  if (response.ok) return;
  const body = (await response.json().catch(() => null)) as {
    message?: string;
    error?: string;
  } | null;
  throw new Error(
    body?.message ?? body?.error ?? `microsoft_disconnect_${response.status}`,
  );
}

export async function syncXboxLibrary(
  installed: Array<{ externalId: string; name?: string }>,
): Promise<{
  synced: number;
  installed: number;
  historyCount: number;
  installedOnlyCount: number;
  hint?: string;
}> {
  const response = await apiFetch("/library/xbox/sync", {
    method: "POST",
    body: JSON.stringify({ installed }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    throw new Error(
      body?.message ?? body?.error ?? `sync_failed_${response.status}`,
    );
  }
  const data = (await response.json()) as {
    ok: boolean;
    synced: number;
    installed: number;
    historyCount?: number;
    installedOnlyCount?: number;
    hint?: string;
  };
  return {
    synced: data.synced,
    installed: data.installed,
    historyCount: data.historyCount ?? 0,
    installedOnlyCount: data.installedOnlyCount ?? 0,
    hint: data.hint,
  };
}

export type EpicStatus = {
  linked: boolean;
  accountId: string | null;
  displayName: string | null;
};

export async function fetchEpicStatus(): Promise<EpicStatus> {
  const response = await apiFetch("/auth/epic/status");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = (await response.json()) as {
    ok: boolean;
    linked: boolean;
    accountId: string | null;
    displayName: string | null;
  };
  return {
    linked: data.linked,
    accountId: data.accountId,
    displayName: data.displayName,
  };
}

export async function exchangeEpicCode(code: string): Promise<EpicStatus> {
  const response = await apiFetch("/auth/epic/exchange", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Session PlayNext expirée. Reconnecte Discord.");
    }
    const body = (await response.json().catch(() => null)) as {
      message?: string;
      error?: string;
    } | null;
    throw new Error(
      body?.message ?? body?.error ?? `epic_exchange_${response.status}`,
    );
  }
  const data = (await response.json()) as {
    linked: boolean;
    accountId: string | null;
    displayName: string | null;
  };
  return {
    linked: data.linked,
    accountId: data.accountId,
    displayName: data.displayName,
  };
}

export async function disconnectEpic(): Promise<void> {
  const response = await apiFetch("/auth/epic/disconnect", { method: "POST" });
  if (!response.ok) throw new Error(`epic_disconnect_${response.status}`);
}

export async function syncEpicLibrary(
  installed: Array<{ externalId: string; name?: string }>,
): Promise<{ synced: number; installed: number; ownedCount: number }> {
  const response = await apiFetch("/library/epic/sync", {
    method: "POST",
    body: JSON.stringify({ installed }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    throw new Error(
      body?.message ?? body?.error ?? `sync_failed_${response.status}`,
    );
  }
  const data = (await response.json()) as {
    synced: number;
    installed: number;
    ownedCount?: number;
  };
  return {
    synced: data.synced,
    installed: data.installed,
    ownedCount: data.ownedCount ?? 0,
  };
}
