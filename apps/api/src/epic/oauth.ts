/**
 * Epic Games Launcher public OAuth client (same as Playnite / Legendary / Heroic).
 * Not a PlayNext-owned secret — required to talk to Epic consumer library APIs.
 */
export const EPIC_LAUNCHER_CLIENT_ID = "34a02cf8f4414e29b15921876da36f9a";
const EPIC_BASIC_AUTH =
  "MzRhMDJjZjhmNDQxNGUyOWIxNTkyMTg3NmRhMzZmOWE6ZGFhZmJjY2M3Mzc3NDUwMzlkZmZlNTNkOTRmYzc2Y2Y=";

const OAUTH_TOKEN_URL =
  "https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token";

export type EpicTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: string;
  token_type: string;
  account_id: string;
  displayName?: string;
};

/**
 * Single tab: Epic redirect endpoint (asks login if needed, then JSON with authorizationCode).
 * Same as Playnite alternative auth — avoid /id/login?redirectUrl=… (can open duplicate tabs).
 */
export function buildEpicLoginUrl(): string {
  const url = new URL("https://www.epicgames.com/id/api/redirect");
  url.searchParams.set("clientId", EPIC_LAUNCHER_CLIENT_ID);
  url.searchParams.set("responseType", "code");
  return url.toString();
}

async function tokenRequest(
  body: Record<string, string>,
): Promise<EpicTokenResponse> {
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `basic ${EPIC_BASIC_AUTH}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`epic_token_${response.status}:${text.slice(0, 300)}`);
  }
  return (await response.json()) as EpicTokenResponse;
}

export async function exchangeEpicAuthCode(
  code: string,
): Promise<EpicTokenResponse> {
  return tokenRequest({
    grant_type: "authorization_code",
    code: code.trim(),
    token_type: "eg1",
  });
}

export async function refreshEpicToken(
  refreshToken: string,
): Promise<EpicTokenResponse> {
  return tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    token_type: "eg1",
  });
}
