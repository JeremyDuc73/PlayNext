export type Launcher = "steam" | "xbox" | "epic" | string;

const LAUNCHER_RANK: Record<string, number> = {
  steam: 0,
  xbox: 1,
  epic: 2,
  riot: 3,
};

/** Drop playtests, demos, tools, and other non-games. */
export function isJunkGameName(name: string): boolean {
  const n = name.toLowerCase();
  // word-ish matches so "Democracy" isn't killed by "demo"
  return (
    /\bplaytest\b/i.test(n) ||
    /\bdemo\b/i.test(n) ||
    /\bmodkit\b/i.test(n) ||
    /\bmod\s*kit\b/i.test(n) ||
    /\bplay\s*test\b/i.test(n) ||
    n.includes(" - demo") ||
    n.includes("(demo)") ||
    n.includes("[demo]") ||
    n.includes(" - playtest") ||
    n.includes("(playtest)") ||
    /\bsteam(?!\s*world)/i.test(n) ||
    /\bwallpaper\b/i.test(n) ||
    /3d\s*mark/i.test(n) ||
    /\baim\s*labs?\b/i.test(n) ||
    /\bdiscord\b/i.test(n) ||
    /\brpg\s*maker\s*xp\b/i.test(n)
  );
}

/** Normalize title for cross-launcher duplicate detection. */
export function normalizeGameTitle(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/™|®|©/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(
      /\b(goty|game of the year|deluxe|definitive|ultimate|gold|standard|edition|remastered|remake|hd|complete|collection|bundle|windows|pc|xbox|steam|epic)\b/g,
      " ",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function launcherRank(launcher: string): number {
  return LAUNCHER_RANK[launcher] ?? 50;
}

/**
 * Keep one entry per normalized title, preferring steam → xbox → epic → riot.
 * Among same launcher, prefer installed, then longer name (more specific).
 */
export function dedupePreferLaunchers<
  T extends { name: string; launcher: string; installed?: boolean },
>(games: T[]): T[] {
  const best = new Map<string, T>();

  for (const game of games) {
    if (isJunkGameName(game.name)) continue;
    const key = normalizeGameTitle(game.name);
    if (!key) continue;

    const current = best.get(key);
    if (!current) {
      best.set(key, game);
      continue;
    }

    const rankNew = launcherRank(game.launcher);
    const rankOld = launcherRank(current.launcher);
    if (rankNew < rankOld) {
      best.set(key, game);
      continue;
    }
    if (rankNew > rankOld) continue;

    const instNew = game.installed ? 1 : 0;
    const instOld = current.installed ? 1 : 0;
    if (instNew > instOld) {
      best.set(key, game);
      continue;
    }
    if (game.name.length > current.name.length) {
      best.set(key, game);
    }
  }

  return [...best.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "fr", { sensitivity: "base" }),
  );
}

export function filterJunkGames<T extends { name: string }>(games: T[]): T[] {
  return games.filter((g) => !isJunkGameName(g.name));
}

/**
 * Exceptions produit : certains jeux ont du coop en ligne mais ne sont pas
 * adaptés à une décision de groupe « on joue tous ensemble ».
 * Ils restent visibles dans la bibliothèque personnelle.
 */
const GROUP_INCOMPATIBLE_TITLES = new Set(["elden ring"]);

const GROUP_PLAYABLE_TITLES = new Set(["league of legends", "valorant"]);

export function groupPlayableOverride(name: string): boolean | null {
  const key = normalizeGameTitle(name);
  if (GROUP_INCOMPATIBLE_TITLES.has(key)) return false;
  if (GROUP_PLAYABLE_TITLES.has(key)) return true;
  return null;
}

export function resolveGroupPlayable(input: {
  name: string;
  launcher: string;
  stored?: boolean | null;
  byTitle?: boolean | null;
}): boolean | null {
  const override = groupPlayableOverride(input.name);
  if (override != null) return override;
  if (input.launcher === "riot") return true;
  if (input.stored != null) return input.stored;
  return input.byTitle ?? null;
}

/** IGDB : 1 solo · 2 multi · 3 coop · 4 split-screen · 5 MMO · 6 battle royale */
export function groupPlayableFromIgdbModes(
  modeIds: number[] | null | undefined,
): boolean | null {
  if (!modeIds?.length) return null;
  const GROUP = new Set([2, 3, 4, 5, 6]);
  if (modeIds.some((id) => GROUP.has(id))) return true;
  if (modeIds.includes(1)) return false;
  return null;
}

/** Solo connus hors groupe / soirée. Inconnus visibles jusqu’au classement Steam. */
export function isVisibleInGroup(playable: boolean | null): boolean {
  return playable !== false;
}

export function mergeGroupPlayable(
  current: boolean | null,
  next: boolean | null,
): boolean | null {
  if (current === true || next === true) return true;
  if (current === false || next === false) return false;
  return null;
}
