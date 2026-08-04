import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type EpicScanResult = {
  epicFound: boolean;
  manifestCount: number;
  games: Array<{
    launcher: "epic";
    externalId: string;
    name: string;
    installed: boolean;
    owned: boolean;
    launchable: boolean;
  }>;
  warnings: string[];
};

export async function scanEpicLocal(): Promise<EpicScanResult> {
  const result = await invoke<EpicScanResult>("scan_epic");
  return {
    epicFound: result.epicFound,
    manifestCount: result.manifestCount ?? 0,
    warnings: result.warnings ?? [],
    games: (result.games ?? []).map((game) => ({
      launcher: "epic" as const,
      externalId: game.externalId,
      name: game.name,
      installed: true,
      owned: true,
      launchable: true,
    })),
  };
}

/** Opens Epic in a native Tauri window and captures Playnite's auth redirect. */
export async function startEpicLoginNative(): Promise<string> {
  let unlistenCode: (() => void) | undefined;
  let unlistenCancelled: (() => void) | undefined;
  let timeout: number | undefined;
  let settled = false;
  let finish:
    | ((error: Error | null, code?: string) => void)
    | undefined;
  const result = new Promise<string>((resolve, reject) => {
    finish = (error, code) => {
      if (settled) return;
      settled = true;
      if (timeout != null) window.clearTimeout(timeout);
      unlistenCode?.();
      unlistenCancelled?.();
      if (error) reject(error);
      else if (code) resolve(code);
      else reject(new Error("epic_code_missing"));
    };
  });

  try {
    unlistenCode = await listen<string>("epic-auth-code", (event) =>
      finish?.(null, event.payload),
    );
    unlistenCancelled = await listen("epic-auth-cancelled", () =>
      finish?.(new Error("epic_login_cancelled")),
    );
    timeout = window.setTimeout(
      () => finish?.(new Error("epic_login_timeout")),
      10 * 60 * 1000,
    );
    await invoke("start_epic_login");
    return await result;
  } catch (error) {
    if (timeout != null) window.clearTimeout(timeout);
    unlistenCode?.();
    unlistenCancelled?.();
    throw error;
  }
}
