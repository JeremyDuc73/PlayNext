import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z.string().default("info"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
  APP_URL: z.string().url().default("http://localhost:1420"),
  API_URL: z.string().url().default("http://localhost:3001"),
  WEB_URL: z.string().url().default("http://localhost:4321"),
  SESSION_SECRET: z.string().min(16),
  DISCORD_CLIENT_ID: z.string().optional().default(""),
  DISCORD_CLIENT_SECRET: z.string().optional().default(""),
  DISCORD_REDIRECT_URI: z
    .string()
    .url()
    .default("http://localhost:3001/auth/discord/callback"),
  STEAM_WEB_API_KEY: z.string().optional().default(""),
  MICROSOFT_CLIENT_ID: z.string().optional().default(""),
  /** Fallback when Entra app is confidential (Web) and requires a secret. */
  MICROSOFT_CLIENT_SECRET: z.string().optional().default(""),
  MICROSOFT_REDIRECT_URI: z
    .string()
    .url()
    .default("http://localhost:3001/auth/microsoft/callback"),
});

export function isSteamWebApiConfigured(config: Env): boolean {
  return Boolean(config.STEAM_WEB_API_KEY);
}

export function isMicrosoftConfigured(config: Env): boolean {
  return Boolean(config.MICROSOFT_CLIENT_ID);
}

export type Env = z.infer<typeof envSchema>;

function trimEnv(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  // Strip accidental quotes / whitespace from .env pastes
  return value.trim().replace(/^['"]|['"]$/g, "");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Env {
  const normalized = {
    ...env,
    MICROSOFT_CLIENT_ID: trimEnv(env.MICROSOFT_CLIENT_ID),
    MICROSOFT_CLIENT_SECRET: trimEnv(env.MICROSOFT_CLIENT_SECRET),
    MICROSOFT_REDIRECT_URI: trimEnv(env.MICROSOFT_REDIRECT_URI),
  };
  const parsed = envSchema.safeParse(normalized);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${details}`);
  }
  return parsed.data;
}

export function isDiscordConfigured(config: Env): boolean {
  return Boolean(config.DISCORD_CLIENT_ID && config.DISCORD_CLIENT_SECRET);
}
