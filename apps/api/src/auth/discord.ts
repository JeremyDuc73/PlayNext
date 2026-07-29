import { z } from "zod";
import type { Env } from "../config.js";

const tokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number().optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
});

const discordUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  global_name: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
});

export type DiscordProfile = {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
};

export async function exchangeDiscordCode(
  config: Env,
  code: string,
): Promise<string> {
  const body = new URLSearchParams({
    client_id: config.DISCORD_CLIENT_ID,
    client_secret: config.DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: config.DISCORD_REDIRECT_URI,
  });

  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord token exchange failed (${response.status}): ${text}`);
  }

  const json: unknown = await response.json();
  const parsed = tokenResponseSchema.parse(json);
  return parsed.access_token;
}

export async function fetchDiscordProfile(
  accessToken: string,
): Promise<DiscordProfile> {
  const response = await fetch("https://discord.com/api/users/@me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord profile fetch failed (${response.status}): ${text}`);
  }

  const json: unknown = await response.json();
  const user = discordUserSchema.parse(json);

  return {
    id: user.id,
    username: user.username,
    globalName: user.global_name ?? null,
    avatar: user.avatar ?? null,
  };
}
