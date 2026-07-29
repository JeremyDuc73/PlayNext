export type XboxSession = {
  xstsToken: string;
  userHash: string;
  xuid: string;
  expiresAt: Date;
};

export type XboxTitle = {
  titleId: string;
  pfn: string;
  name: string;
  type: string;
  devices: string[];
};

type XuiClaim = {
  uhs?: string;
  xid?: string;
};

type XstsResponse = {
  Token: string;
  NotAfter?: string;
  DisplayClaims?: {
    xui?: XuiClaim[];
  };
};

type TitleHubTitle = {
  titleId?: string | number;
  pfn?: string;
  name?: string;
  type?: string;
  devices?: string[];
};

function cleanName(name: string): string {
  return name
    .replace(/\(PC\)/gi, "")
    .replace(/\(Windows\)/gi, "")
    .replace(/for Windows 10/gi, "")
    .replace(/- Windows 10/gi, "")
    .replace(/™|®|©/g, "")
    .trim();
}

export async function authenticateXboxLive(
  liveAccessToken: string,
): Promise<XboxSession> {
  const authResponse = await fetch(
    "https://user.auth.xboxlive.com/user/authenticate",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-xbl-contract-version": "1",
      },
      body: JSON.stringify({
        RelyingParty: "http://auth.xboxlive.com",
        TokenType: "JWT",
        Properties: {
          AuthMethod: "RPS",
          SiteName: "user.auth.xboxlive.com",
          RpsTicket: `d=${liveAccessToken}`,
        },
      }),
    },
  );
  if (!authResponse.ok) {
    const text = await authResponse.text();
    throw new Error(`xbox_user_auth_${authResponse.status}:${text.slice(0, 200)}`);
  }
  const authTokens = (await authResponse.json()) as { Token: string };

  const xstsResponse = await fetch(
    "https://xsts.auth.xboxlive.com/xsts/authorize",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-xbl-contract-version": "1",
      },
      body: JSON.stringify({
        RelyingParty: "http://xboxlive.com",
        TokenType: "JWT",
        Properties: {
          UserTokens: [authTokens.Token],
          SandboxId: "RETAIL",
        },
      }),
    },
  );
  if (!xstsResponse.ok) {
    const text = await xstsResponse.text();
    throw new Error(`xbox_xsts_${xstsResponse.status}:${text.slice(0, 200)}`);
  }
  const xsts = (await xstsResponse.json()) as XstsResponse;
  const xui = xsts.DisplayClaims?.xui?.[0];
  if (!xsts.Token || !xui?.uhs || !xui?.xid) {
    throw new Error("xbox_xsts_missing_claims");
  }

  return {
    xstsToken: xsts.Token,
    userHash: xui.uhs,
    xuid: String(xui.xid),
    expiresAt: xsts.NotAfter ? new Date(xsts.NotAfter) : new Date(Date.now() + 3_600_000),
  };
}

function authHeaders(session: XboxSession): Record<string, string> {
  return {
    "x-xbl-contract-version": "2",
    Authorization: `XBL3.0 x=${session.userHash};${session.xstsToken}`,
    "Accept-Language": "en-US",
    "Content-Type": "application/json",
  };
}

function mapTitle(raw: TitleHubTitle): XboxTitle | null {
  if (!raw.pfn || !raw.name) return null;
  return {
    titleId: String(raw.titleId ?? ""),
    pfn: raw.pfn,
    name: cleanName(raw.name),
    type: raw.type ?? "",
    devices: raw.devices ?? [],
  };
}

/** PC games from Xbox Live title history (played / linked). */
export async function fetchTitleHistory(
  session: XboxSession,
): Promise<XboxTitle[]> {
  const url = `https://titlehub.xboxlive.com/users/xuid(${session.xuid})/titles/titlehistory/decoration/detail`;
  const response = await fetch(url, { headers: authHeaders(session) });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`titlehub_history_${response.status}:${text.slice(0, 200)}`);
  }
  const data = (await response.json()) as { titles?: TitleHubTitle[] };
  const titles = (data.titles ?? [])
    .map(mapTitle)
    .filter((t): t is XboxTitle => Boolean(t));

  return titles.filter(
    (t) => t.type === "Game" && t.devices.some((d) => d === "PC"),
  );
}

/** Resolve installed packages not present in title history (never launched, etc.). */
export async function fetchTitlesByPfns(
  session: XboxSession,
  pfns: string[],
): Promise<XboxTitle[]> {
  if (pfns.length === 0) return [];

  const out: XboxTitle[] = [];
  const chunkSize = 20;
  for (let i = 0; i < pfns.length; i += chunkSize) {
    const chunk = pfns.slice(i, i + chunkSize);
    const response = await fetch(
      "https://titlehub.xboxlive.com/titles/batch/decoration/detail",
      {
        method: "POST",
        headers: authHeaders(session),
        body: JSON.stringify({
          pfns: chunk,
          windowsPhoneProductIds: [],
        }),
      },
    );
    if (response.status === 404) continue;
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`titlehub_batch_${response.status}:${text.slice(0, 200)}`);
    }
    const data = (await response.json()) as { titles?: TitleHubTitle[] };
    for (const raw of data.titles ?? []) {
      const mapped = mapTitle(raw);
      if (mapped && mapped.type === "Game") {
        out.push(mapped);
      }
    }
  }
  return out;
}

export type XboxLibraryGame = {
  launcher: "xbox";
  externalId: string;
  name: string;
  installed: boolean;
  owned: boolean;
  launchable: boolean;
};

export function mergeXboxLibrary(
  history: XboxTitle[],
  installed: Array<{ externalId: string; name?: string }>,
  installedOnlyTitles: XboxTitle[],
): XboxLibraryGame[] {
  const installedByPfn = new Map(
    installed.map((g) => [g.externalId.toLowerCase(), g]),
  );
  const byPfn = new Map<string, XboxLibraryGame>();

  for (const title of history) {
    const key = title.pfn.toLowerCase();
    const local = installedByPfn.get(key);
    byPfn.set(key, {
      launcher: "xbox",
      externalId: title.pfn,
      name: title.name,
      installed: Boolean(local),
      owned: true,
      launchable: Boolean(local),
    });
  }

  for (const title of installedOnlyTitles) {
    const key = title.pfn.toLowerCase();
    if (byPfn.has(key)) continue;
    byPfn.set(key, {
      launcher: "xbox",
      externalId: title.pfn,
      name: title.name,
      installed: true,
      owned: true,
      launchable: true,
    });
  }

  return [...byPfn.values()].sort((a, b) => a.name.localeCompare(b.name));
}
