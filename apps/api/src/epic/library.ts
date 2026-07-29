export type EpicOwnedGame = {
  appName: string;
  title: string;
};

type LibraryRecord = {
  appName?: string;
  namespace?: string;
  catalogItemId?: string;
  sandboxType?: string;
  platform?: string[];
};

type LibraryResponse = {
  records?: LibraryRecord[];
  responseMetadata?: { nextCursor?: string | null };
};

type CatalogItem = {
  id?: string;
  title?: string;
  categories?: Array<{ path?: string }>;
  mainGameItem?: unknown;
  customAttributes?: Record<string, { value?: string }>;
};

const LIBRARY_URL =
  "https://library-service.live.use1a.on.epicgames.com/library/api/public/items?includeMetadata=true&platform=Windows";

const CATALOG_BASE =
  "https://catalog-public-service-prod06.ol.epicgames.com/catalog/api/shared/namespace";

/** Unreal Engine / editor tooling namespaces (not games). */
const SKIP_NAMESPACES = new Set([
  "ue",
  "89efe5924d3d467c839449ab6ab52e7f",
]);

const HEX_ID = /^[0-9a-f]{32}$/i;

function authHeader(accessToken: string, tokenType: string): string {
  return `${tokenType} ${accessToken}`;
}

function looksLikeRawId(value: string): boolean {
  return HEX_ID.test(value) || value === "1";
}

function categoryPaths(item: CatalogItem): string[] {
  return (item.categories ?? []).map((c) => (c.path ?? "").toLowerCase());
}

/** Playnite-style: keep launchable applications / games only. */
function isPlayableGame(item: CatalogItem): boolean {
  const cats = categoryPaths(item);
  const isApplication = cats.some(
    (c) => c === "applications" || c.startsWith("applications/") || c === "games" || c.startsWith("games/"),
  );
  if (!isApplication) return false;

  if (
    cats.some(
      (c) =>
        c === "digitalextras" ||
        c === "plugins" ||
        c === "plugins/engine" ||
        c === "mods" ||
        c.startsWith("mods/"),
    )
  ) {
    return false;
  }

  // DLC / addons that aren't standalone-launchable
  if (item.mainGameItem != null && !cats.includes("addons/launchable")) {
    return false;
  }

  const title = item.title?.trim() ?? "";
  if (!title || looksLikeRawId(title)) return false;

  return true;
}

function shouldFetchCatalog(record: LibraryRecord): boolean {
  if (!record.appName || !record.namespace || !record.catalogItemId) {
    return false;
  }
  if (SKIP_NAMESPACES.has(record.namespace.toLowerCase())) return false;
  if (record.sandboxType === "PRIVATE") return false;
  if (record.appName === "1") return false;

  const platforms = record.platform ?? [];
  if (
    platforms.length > 0 &&
    !platforms.some((p) => p === "Windows" || p === "Win32")
  ) {
    return false;
  }

  return true;
}

async function fetchLibraryRecords(
  accessToken: string,
  tokenType: string,
): Promise<LibraryRecord[]> {
  const records: LibraryRecord[] = [];
  let cursor: string | null | undefined = undefined;

  do {
    const url = cursor
      ? `${LIBRARY_URL}&cursor=${encodeURIComponent(cursor)}`
      : LIBRARY_URL;
    const response = await fetch(url, {
      headers: { Authorization: authHeader(accessToken, tokenType) },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`epic_library_${response.status}:${text.slice(0, 300)}`);
    }
    const data = (await response.json()) as LibraryResponse;
    records.push(...(data.records ?? []));
    cursor = data.responseMetadata?.nextCursor ?? null;
  } while (cursor);

  return records;
}

async function fetchCatalogBulk(
  accessToken: string,
  tokenType: string,
  namespace: string,
  catalogIds: string[],
): Promise<Map<string, CatalogItem>> {
  const out = new Map<string, CatalogItem>();
  const chunkSize = 40;
  for (let i = 0; i < catalogIds.length; i += chunkSize) {
    const chunk = catalogIds.slice(i, i + chunkSize);
    const params = new URLSearchParams();
    for (const id of chunk) params.append("id", id);
    params.set("country", "FR");
    params.set("locale", "fr");
    params.set("includeMainGameDetails", "true");

    const url = `${CATALOG_BASE}/${encodeURIComponent(namespace)}/bulk/items?${params}`;
    const response = await fetch(url, {
      headers: { Authorization: authHeader(accessToken, tokenType) },
    });
    if (!response.ok) {
      // Soft-fail a chunk — skip those titles rather than aborting the sync.
      continue;
    }
    const data = (await response.json()) as Record<string, CatalogItem>;
    for (const [id, item] of Object.entries(data)) {
      out.set(id, item);
    }
  }
  return out;
}

export async function fetchEpicLibrary(
  accessToken: string,
  tokenType = "bearer",
): Promise<EpicOwnedGame[]> {
  const records = (await fetchLibraryRecords(accessToken, tokenType)).filter(
    shouldFetchCatalog,
  );

  const byNamespace = new Map<string, LibraryRecord[]>();
  for (const record of records) {
    const ns = record.namespace!;
    const list = byNamespace.get(ns) ?? [];
    list.push(record);
    byNamespace.set(ns, list);
  }

  const catalogByNs = new Map<string, Map<string, CatalogItem>>();
  const namespaces = [...byNamespace.keys()];
  const concurrency = 4;
  for (let i = 0; i < namespaces.length; i += concurrency) {
    const batch = namespaces.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (ns) => {
        const ids = [
          ...new Set(
            (byNamespace.get(ns) ?? [])
              .map((r) => r.catalogItemId)
              .filter((id): id is string => Boolean(id)),
          ),
        ];
        const catalog = await fetchCatalogBulk(
          accessToken,
          tokenType,
          ns,
          ids,
        );
        catalogByNs.set(ns, catalog);
      }),
    );
  }

  const games: EpicOwnedGame[] = [];
  for (const record of records) {
    const catalog = catalogByNs
      .get(record.namespace!)
      ?.get(record.catalogItemId!);
    if (!catalog || !isPlayableGame(catalog)) continue;

    games.push({
      appName: record.appName!,
      title: catalog.title!.trim(),
    });
  }

  const byId = new Map<string, EpicOwnedGame>();
  for (const game of games) {
    if (!byId.has(game.appName)) byId.set(game.appName, game);
  }

  return [...byId.values()].sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
  );
}

export type EpicLibraryGame = {
  launcher: "epic";
  externalId: string;
  name: string;
  installed: boolean;
  owned: boolean;
  launchable: boolean;
};

export function mergeEpicLibrary(
  owned: EpicOwnedGame[],
  installed: Array<{ externalId: string; name?: string }>,
): EpicLibraryGame[] {
  const installedById = new Map(
    installed.map((g) => [g.externalId.toLowerCase(), g]),
  );
  const byId = new Map<string, EpicLibraryGame>();

  for (const game of owned) {
    const key = game.appName.toLowerCase();
    const local = installedById.get(key);
    byId.set(key, {
      launcher: "epic",
      externalId: game.appName,
      name: game.title,
      installed: Boolean(local),
      owned: true,
      launchable: Boolean(local),
    });
  }

  for (const local of installed) {
    const key = local.externalId.toLowerCase();
    if (byId.has(key)) continue;
    const name = local.name?.trim();
    // Skip installed leftovers that are clearly not games (raw ids / UE).
    if (!name || looksLikeRawId(name) || local.externalId.startsWith("UE_")) {
      continue;
    }
    byId.set(key, {
      launcher: "epic",
      externalId: local.externalId,
      name,
      installed: true,
      owned: true,
      launchable: true,
    });
  }

  return [...byId.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}
