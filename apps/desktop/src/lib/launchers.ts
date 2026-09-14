import { openExternalUrl } from "./desktop-auth";
import { formatParisWhen } from "./paris";
import { pad2 } from "./format";
import type { Evening, EveningCandidate } from "./evenings";

export function getLauncherLabel(launcher: string): string {
  switch (launcher.toLowerCase()) {
    case "steam":
      return "Steam";
    case "epic":
      return "Epic";
    case "riot":
      return "Riot";
    case "xbox":
      return "Xbox";
    default:
      return launcher.toUpperCase();
  }
}

export function getLaunchUrl(launcher: string, externalId: string): string | null {
  const l = launcher.toLowerCase();
  if (l === "steam") {
    return `steam://run/${encodeURIComponent(externalId)}`;
  }
  if (l === "epic") {
    return `com.epicgames.launcher://apps/${encodeURIComponent(externalId)}?action=launch`;
  }
  if (l === "riot") {
    return `riotclient://launch-product?product=${encodeURIComponent(externalId)}&patchline=live`;
  }
  if (l === "xbox") {
    return "xbox://";
  }
  return null;
}

export function getInstallUrl(launcher: string, externalId: string): string | null {
  const l = launcher.toLowerCase();
  if (l === "steam") {
    return `steam://install/${encodeURIComponent(externalId)}`;
  }
  if (l === "epic") {
    return `com.epicgames.launcher://apps/${encodeURIComponent(externalId)}?action=launch`;
  }
  if (l === "xbox") {
    return `ms-windows-store://pdp/?PFN=${encodeURIComponent(externalId)}`;
  }
  return null;
}

export function getStoreUrl(launcher: string, externalId: string): string | null {
  const l = launcher.toLowerCase();
  if (l === "steam") {
    return `https://store.steampowered.com/app/${encodeURIComponent(externalId)}/`;
  }
  if (l === "epic") {
    return "https://store.epicgames.com/";
  }
  return null;
}

export async function launchGame(launcher: string, externalId: string): Promise<boolean> {
  const url = getLaunchUrl(launcher, externalId);
  if (!url) return false;
  try {
    await openExternalUrl(url);
    return true;
  } catch {
    return false;
  }
}

export async function installGame(launcher: string, externalId: string): Promise<boolean> {
  const url = getInstallUrl(launcher, externalId) || getStoreUrl(launcher, externalId);
  if (!url) return false;
  try {
    await openExternalUrl(url);
    return true;
  } catch {
    return false;
  }
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallback below
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function buildEveningSummaryText(
  evening: Evening,
  winner: EveningCandidate,
): string {
  const lines: string[] = [];
  lines.push(`PlayNext · Ce soir on joue à : ${winner.name.toUpperCase()}`);

  if (evening.scheduledAt) {
    lines.push(`Rendez-vous : ${formatParisWhen(evening.scheduledAt)}`);
  }

  if (evening.resolution?.usedRoulette) {
    lines.push(`Égalité départagée par tirage au sort`);
  }

  if (winner.tally) {
    const parts = [
      winner.tally.hot > 0 ? `${pad2(winner.tally.hot)} Chaud` : null,
      winner.tally.maybe > 0 ? `${pad2(winner.tally.maybe)} Pourquoi pas` : null,
      winner.tally.pass > 0 ? `${pad2(winner.tally.pass)} Pass` : null,
      winner.tally.veto > 0 ? `${pad2(winner.tally.veto)} Veto` : null,
    ].filter(Boolean);
    if (parts.length > 0) {
      lines.push(`Votes : ${parts.join(" · ")}`);
    }
  }

  const store = getStoreUrl(winner.launcher, winner.externalId);
  if (store) {
    lines.push(`Store : ${store}`);
  }

  return lines.join("\n");
}
