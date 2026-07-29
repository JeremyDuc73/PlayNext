const LIVE_AUTHORIZE = "https://login.live.com/oauth20_authorize.srf";
const LIVE_TOKEN = "https://login.live.com/oauth20_token.srf";

export const MICROSOFT_SCOPES = "Xboxlive.signin Xboxlive.offline_access";

export type LiveTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user_id?: string;
};

export function buildMicrosoftAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(LIVE_AUTHORIZE);
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("approval_prompt", "auto");
  url.searchParams.set("scope", MICROSOFT_SCOPES);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("state", opts.state);
  return url.toString();
}

async function tokenRequest(
  body: Record<string, string>,
): Promise<LiveTokenResponse> {
  const response = await fetch(LIVE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`live_token_${response.status}:${text.slice(0, 200)}`);
  }
  return (await response.json()) as LiveTokenResponse;
}

export async function exchangeMicrosoftCode(opts: {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  code: string;
}): Promise<LiveTokenResponse> {
  const body: Record<string, string> = {
    grant_type: "authorization_code",
    code: opts.code,
    scope: MICROSOFT_SCOPES,
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
  };
  if (opts.clientSecret) {
    body.client_secret = opts.clientSecret;
  }
  return tokenRequest(body);
}

export async function refreshMicrosoftToken(opts: {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  refreshToken: string;
}): Promise<LiveTokenResponse> {
  const body: Record<string, string> = {
    grant_type: "refresh_token",
    refresh_token: opts.refreshToken,
    scope: MICROSOFT_SCOPES,
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
  };
  if (opts.clientSecret) {
    body.client_secret = opts.clientSecret;
  }
  return tokenRequest(body);
}
