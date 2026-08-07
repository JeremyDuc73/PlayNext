/** Mirror of API filter — keep UI dedupe in sync with server rules. */

const LAUNCHER_RANK: Record<string, number> = {
  steam: 0,
  xbox: 1,
  epic: 2,
  riot: 3,
};

export function isJunkGameName(name: string): boolean {
  const n = name.toLowerCase();
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
    n.includes("(playtest)")
  );
}

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

    const rankNew = LAUNCHER_RANK[game.launcher] ?? 50;
    const rankOld = LAUNCHER_RANK[current.launcher] ?? 50;
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
