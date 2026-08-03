export type GroupPlayable = boolean | null;

type StoreApp = {
  success?: boolean;
  data?: {
    categories?: Array<{ description?: string }>;
  };
};

function cleanAppId(value: string): string {
  return value.replace(/[^\d]/g, "");
}

function hasGroupMode(labels: string[]): boolean {
  return labels.some((label) =>
    /multi-player|multiplayer|co-?op|mmo|pvp|shared\/split screen/i.test(
      label,
    ),
  );
}

function hasSinglePlayerMode(labels: string[]): boolean {
  return labels.some((label) => /single-player|singleplayer/i.test(label));
}

/**
 * Steam Store fournit les modes de jeu sans clé.
 * Les AppIDs sont interrogés par petit pool et le résultat est seulement
 * utilisé pour la shortlist : la bibliothèque personnelle reste inchangée.
 */
export async function fetchSteamGroupPlayable(
  appIds: string[],
): Promise<Map<string, GroupPlayable>> {
  const ids = [
    ...new Set(appIds.map(cleanAppId).filter((id) => id.length > 0)),
  ];
  const result = new Map<string, GroupPlayable>();
  if (ids.length === 0) return result;

  async function fetchOne(id: string): Promise<GroupPlayable | undefined> {
    try {
      const url = new URL(
        "https://store.steampowered.com/api/appdetails",
      );
      url.searchParams.set("appids", id);
      url.searchParams.set("l", "english");
      url.searchParams.set("cc", "US");

      const response = await fetch(url, {
        headers: { "User-Agent": "PlayNext/0.1" },
      });
      if (!response.ok) return undefined;

      const data = (await response.json()) as Record<string, StoreApp>;
      const app = data[id];
      if (!app?.success || !app.data?.categories) return undefined;
      const labels = app.data.categories
        .map((category) => category.description?.trim().toLowerCase())
        .filter((label): label is string => Boolean(label));

      if (hasGroupMode(labels)) return true;
      if (hasSinglePlayerMode(labels)) return false;
      return null;
    } catch {
      // Un service catalogue indisponible ne doit pas bloquer une soirée.
      return undefined;
    }
  }

  // Steam limite/ralentit les appels : petit pool borné plutôt qu’un burst.
  for (let i = 0; i < ids.length; i += 4) {
    const batch = ids.slice(i, i + 4);
    const modes = await Promise.all(
      batch.map(async (id) => [id, await fetchOne(id)] as const),
    );
    for (const [id, mode] of modes) {
      if (mode !== undefined) result.set(id, mode);
    }
  }

  return result;
}
