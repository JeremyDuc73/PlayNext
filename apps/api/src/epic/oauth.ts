import type { Env } from "../config.js";

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
 * OAuth standard : Epic redirects to the callback registered for the PlayNext
 * client instead of displaying a JSON response.
 */
export function buildEpicLoginUrl(config: Env, state: string): string {
  const url = new URL("https://www.epicgames.com/id/authorize");
  url.searchParams.set("client_id", config.EPIC_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "basic_profile");
  url.searchParams.set("redirect_uri", config.EPIC_REDIRECT_URI);
  url.searchParams.set("state", state);
  return url.toString();
}

async function tokenRequest(
  config: Env,
  body: Record<string, string>,
): Promise<EpicTokenResponse> {
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${config.EPIC_CLIENT_ID}:${config.EPIC_CLIENT_SECRET}`,
      ).toString("base64")}`,
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
  config: Env,
  code: string,
): Promise<EpicTokenResponse> {
  return tokenRequest(config, {
    grant_type: "authorization_code",
    code: code.trim(),
    redirect_uri: config.EPIC_REDIRECT_URI,
  });
}

export async function refreshEpicToken(
  config: Env,
  refreshToken: string,
): Promise<EpicTokenResponse> {
  return tokenRequest(config, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}
