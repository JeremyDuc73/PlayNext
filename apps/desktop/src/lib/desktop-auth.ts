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

/** Parse `playnext://auth/callback?handoff=...` or `?error=...`. */
export function parseAuthDeepLink(url: string): {
  handoff?: string;
  error?: string;
} | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "playnext:") return null;

    const handoff = parsed.searchParams.get("handoff") ?? undefined;
    const error = parsed.searchParams.get("error") ?? undefined;
    if (!handoff && !error) return null;
    return { handoff, error };
  } catch {
    return null;
  }
}
