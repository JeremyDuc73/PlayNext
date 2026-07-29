import { createHash, randomBytes } from "node:crypto";

/**
 * Microsoft OAuth for Xbox — public client + PKCE only.
 * Confidential client_secret is intentionally not used (unreliable for this flow).
 */
const AUTHORIZE =
  "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize";
const TOKEN = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";

export const MICROSOFT_SCOPES =
  "Xboxlive.signin Xboxlive.offline_access offline_access";

export type LiveTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user_id?: string;
};

export type PkcePair = {
  verifier: string;
  challenge: string;
};

export function createPkcePair(): PkcePair {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildMicrosoftAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(AUTHORIZE);
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", MICROSOFT_SCOPES);
  url.searchParams.set("state", opts.state);
  url.searchParams.set("code_challenge", opts.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

async function tokenRequest(
  body: Record<string, string>,
): Promise<LiveTokenResponse> {
  const response = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ms_token_${response.status}:${text.slice(0, 400)}`);
  }
  return (await response.json()) as LiveTokenResponse;
}

/** One attempt only — auth codes are single-use. */
export async function exchangeMicrosoftCode(opts: {
  clientId: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}): Promise<LiveTokenResponse> {
  return tokenRequest({
    grant_type: "authorization_code",
    code: opts.code,
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    scope: MICROSOFT_SCOPES,
    code_verifier: opts.codeVerifier,
  });
}

export async function refreshMicrosoftToken(opts: {
  clientId: string;
  refreshToken: string;
}): Promise<LiveTokenResponse> {
  return tokenRequest({
    grant_type: "refresh_token",
    refresh_token: opts.refreshToken,
    client_id: opts.clientId,
    scope: MICROSOFT_SCOPES,
  });
}
