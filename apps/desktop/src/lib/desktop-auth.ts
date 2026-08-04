import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getApiUrl } from "./api";

export function runningInDesktopShell(): boolean {
  try {
    return isTauri();
  } catch {
    return false;
  }
}

export async function startDiscordLogin(): Promise<DeepLinkPayload | null> {
  const url = `${getApiUrl()}/auth/discord${runningInDesktopShell() ? "?client=desktop" : ""}`;

  if (runningInDesktopShell()) {
    return startNativeAuthWindow(
      url,
      "start_discord_login",
      "discord-auth-result",
      "discord-auth-cancelled",
    );
  }

  window.location.href = url;
  return null;
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
      kind: "invite";
      code: string;
    };

export function startMicrosoftLoginNative(
  url: string,
): Promise<DeepLinkPayload> {
  return startNativeAuthWindow(
    url,
    "start_microsoft_login",
    "microsoft-auth-result",
    "microsoft-auth-cancelled",
  );
}

async function startNativeAuthWindow(
  url: string,
  command: string,
  resultEvent: string,
  cancelledEvent: string,
): Promise<DeepLinkPayload> {
  let unlistenResult: (() => void) | undefined;
  let unlistenCancelled: (() => void) | undefined;
  let timeout: number | undefined;
  let settled = false;
  let finish:
    | ((error: Error | null, payload?: DeepLinkPayload) => void)
    | undefined;
  const result = new Promise<DeepLinkPayload>((resolve, reject) => {
    finish = (error, payload) => {
      if (settled) return;
      settled = true;
      if (timeout != null) window.clearTimeout(timeout);
      unlistenResult?.();
      unlistenCancelled?.();
      if (error) reject(error);
      else if (payload) resolve(payload);
      else reject(new Error(`${command}_callback_missing`));
    };
  });

  try {
    unlistenResult = await listen<string>(resultEvent, (event) => {
      const payload = parseAuthDeepLink(event.payload);
      finish?.(
        payload ? null : new Error(`${command}_callback_invalid`),
        payload ?? undefined,
      );
    });
    unlistenCancelled = await listen(cancelledEvent, () =>
      finish?.(new Error(`${command}_cancelled`)),
    );
    timeout = window.setTimeout(
      () => finish?.(new Error(`${command}_timeout`)),
      10 * 60 * 1000,
    );
    await invoke(command, { url });
    return await result;
  } catch (error) {
    if (timeout != null) window.clearTimeout(timeout);
    unlistenResult?.();
    unlistenCancelled?.();
    throw error;
  }
}

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
  // Prefer a new tab so PlayNext stays open during external authentication.
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    window.location.href = url;
  }
}
