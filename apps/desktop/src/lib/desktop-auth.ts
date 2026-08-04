import { isTauri } from "@tauri-apps/api/core";
import { getApiUrl } from "./api";

export function runningInDesktopShell(): boolean {
  try {
    return isTauri();
  } catch {
    return false;
  }
}

export async function startDiscordLogin(): Promise<void> {
  const url = `${getApiUrl()}/auth/discord${runningInDesktopShell() ? "?client=desktop" : ""}`;

  if (runningInDesktopShell()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
    return;
  }

  window.location.href = url;
}

export type DeepLinkPayload =
  | {
      kind: "discord";
      handoff?: string;
      error?: string;
    }
  | {
      kind: "microsoft";
      error?: string;
      ok?: boolean;
    }
  | {
      kind: "epic";
      error?: string;
      ok?: boolean;
    }
  | {
      kind: "invite";
      code: string;
    };

/** Parse Discord handoff, Microsoft link, or group invite deep links. */
export function parseAuthDeepLink(url: string): DeepLinkPayload | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "playnext:") return null;

    // Keep original casing for invite codes (base64url is case-sensitive).
    const rawHostPath = `${parsed.hostname}${parsed.pathname}`.replace(
      /\/+$/,
      "",
    );
    const hostPath = rawHostPath.toLowerCase();

    // playnext://invite/<code> or playnext://invite?code=
    if (hostPath === "invite" || hostPath.startsWith("invite/")) {
      const fromPath = rawHostPath.replace(/^invite\/?/i, "").replace(/\/+$/, "");
      const code =
        (fromPath ? fromPath : null) ?? parsed.searchParams.get("code");
      if (!code) return null;
      return { kind: "invite", code: decodeURIComponent(code) };
    }

    if (
      hostPath === "auth/microsoft" ||
      hostPath.endsWith("/auth/microsoft")
    ) {
      const error = parsed.searchParams.get("error") ?? undefined;
      const ok = parsed.searchParams.get("ok") === "1";
      if (!error && !ok) return null;
      return { kind: "microsoft", error, ok };
    }

    if (hostPath === "auth/epic" || hostPath.endsWith("/auth/epic")) {
      const error = parsed.searchParams.get("error") ?? undefined;
      const ok = parsed.searchParams.get("ok") === "1";
      if (!error && !ok) return null;
      return { kind: "epic", error, ok };
    }

    // playnext://auth/callback?handoff=...
    const handoff = parsed.searchParams.get("handoff") ?? undefined;
    const error = parsed.searchParams.get("error") ?? undefined;
    if (!handoff && !error) return null;
    return { kind: "discord", handoff, error };
  } catch {
    return null;
  }
}

export async function openExternalUrl(url: string): Promise<void> {
  if (runningInDesktopShell()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
    return;
  }
  // Prefer a new tab so PlayNext stays open (needed for Epic code paste).
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    window.location.href = url;
  }
}
