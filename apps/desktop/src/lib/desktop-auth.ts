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

/** Parse Discord handoff or Microsoft link deep links. */
export function parseAuthDeepLink(url: string): {
  kind: "discord" | "microsoft";
  handoff?: string;
  error?: string;
  ok?: boolean;
} | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "playnext:") return null;

    const hostPath = `${parsed.hostname}${parsed.pathname}`
      .replace(/\/+$/, "")
      .toLowerCase();
    if (
      hostPath === "auth/microsoft" ||
      hostPath.endsWith("/auth/microsoft")
    ) {
      const error = parsed.searchParams.get("error") ?? undefined;
      const ok = parsed.searchParams.get("ok") === "1";
      if (!error && !ok) return null;
      return { kind: "microsoft", error, ok };
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
