export type SteamCoverAssets = {
  coverUrl: string | null;
  fallbackUrls: string[];
};

type SteamStoreItem = {
  appid?: number;
  assets?: {
    asset_url_format?: string;
    library_capsule_2x?: string;
    library_capsule?: string;
    main_capsule?: string;
    header?: string;
  };
};

type SteamStoreResponse = {
  response?: {
    store_items?: SteamStoreItem[];
  };
};

const STEAM_ASSET_URL =
  "https://api.steampowered.com/IStoreBrowseService/GetItems/v1/";
const ASSET_NAMES = [
  "library_capsule_2x",
  "library_capsule",
  "main_capsule",
  "header",
] as const;

function assetUrl(format: string, filename: string): string {
  return `https://shared.cloudflare.steamstatic.com/store_item_assets/${format.replace(
    "${FILENAME}",
    filename,
  )}`;
}

/** Resolve Steam's content-hashed library art for newer AppIDs. */
export async function fetchSteamCoverAssets(
  appIds: string[],
): Promise<Map<string, SteamCoverAssets>> {
  const ids = [
    ...new Set(
      appIds
        .map((id) => id.replace(/[^\d]/g, ""))
        .filter((id) => id.length > 0),
    ),
  ];
  const result = new Map<string, SteamCoverAssets>();

  for (let offset = 0; offset < ids.length; offset += 100) {
    const chunk = ids.slice(offset, offset + 100);
    const url = new URL(STEAM_ASSET_URL);
    url.searchParams.set(
      "input_json",
      JSON.stringify({
        ids: chunk.map((appid) => ({ appid: Number(appid) })),
        context: {
          language: "english",
          country_code: "US",
          steam_realm: 1,
        },
        data_request: { include_assets: true },
      }),
    );

    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const data = (await response.json()) as SteamStoreResponse;
      for (const item of data.response?.store_items ?? []) {
        const format = item.assets?.asset_url_format;
        if (!format) continue;
        const urls = ASSET_NAMES.map((name) => {
          const filename = item.assets?.[name];
          return filename ? assetUrl(format, filename) : null;
        }).filter((value): value is string => Boolean(value));
        if (urls.length > 0 && item.appid != null) {
          result.set(String(item.appid), {
            coverUrl: urls[0] ?? null,
            fallbackUrls: urls.slice(1),
          });
        }
      }
    } catch {
      // Static CDN candidates remain available when Steam metadata is down.
    }
  }

  return result;
}
