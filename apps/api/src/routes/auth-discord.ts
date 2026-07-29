import type { FastifyPluginAsync } from "fastify";
import { randomBytes } from "node:crypto";
import type { Env } from "../config.js";
import { isDiscordConfigured } from "../config.js";
import type { Db } from "../db.js";
import {
  exchangeDiscordCode,
  fetchDiscordProfile,
} from "../auth/discord.js";
import { consumeHandoffCode, createHandoffCode } from "../auth/handoff.js";
import { getSessionToken } from "../auth/request-session.js";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSession,
  findUserBySessionToken,
  revokeSession,
  upsertDiscordUser,
} from "../auth/session.js";

type AuthDiscordRoutesOptions = {
  config: Env;
  db: Db;
};

const DISCORD_AUTHORIZE_URL = "https://discord.com/api/oauth2/authorize";
const OAUTH_CLIENT_COOKIE = "discord_oauth_client";

/** Minimal Discord OAuth scopes for V1 identity. */
const DISCORD_SCOPES = ["identify"] as const;

function sessionCookieOptions(config: Env) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: config.NODE_ENV === "production",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export const authDiscordRoutes: FastifyPluginAsync<
  AuthDiscordRoutesOptions
> = async (app, opts) => {
  const { config, db } = opts;

  app.get<{
    Querystring: { client?: string };
  }>("/auth/discord", async (request, reply) => {
    if (!isDiscordConfigured(config)) {
      return reply.code(503).send({
        ok: false,
        error: "discord_not_configured",
        message:
          "DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET are required. Copy .env.example to .env and fill Discord credentials.",
      });
    }

    const client =
      request.query.client === "desktop" ? "desktop" : "web";

    const state = randomBytes(16).toString("hex");
    reply.setCookie("discord_oauth_state", state, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: config.NODE_ENV === "production",
      maxAge: 60 * 10,
    });
    reply.setCookie(OAUTH_CLIENT_COOKIE, client, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: config.NODE_ENV === "production",
      maxAge: 60 * 10,
    });

    const url = new URL(DISCORD_AUTHORIZE_URL);
    url.searchParams.set("client_id", config.DISCORD_CLIENT_ID);
    url.searchParams.set("redirect_uri", config.DISCORD_REDIRECT_URI);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", DISCORD_SCOPES.join(" "));
    url.searchParams.set("state", state);
    url.searchParams.set("prompt", "consent");

    return reply.redirect(url.toString());
  });

  app.get<{
    Querystring: { code?: string; state?: string; error?: string };
  }>("/auth/discord/callback", async (request, reply) => {
    if (!isDiscordConfigured(config)) {
      return reply.code(503).send({
        ok: false,
        error: "discord_not_configured",
      });
    }

    const oauthClient =
      request.cookies[OAUTH_CLIENT_COOKIE] === "desktop" ? "desktop" : "web";

    if (request.query.error) {
      reply.clearCookie(OAUTH_CLIENT_COOKIE, { path: "/" });
      if (oauthClient === "desktop") {
        return reply.redirect(
          `playnext://auth/callback?error=${encodeURIComponent(request.query.error)}`,
        );
      }
      return reply.redirect(
        `${config.APP_URL}/?auth=error&reason=${encodeURIComponent(request.query.error)}`,
      );
    }

    const expectedState = request.cookies.discord_oauth_state;
    if (
      !request.query.state ||
      !expectedState ||
      request.query.state !== expectedState
    ) {
      return reply.code(400).send({
        ok: false,
        error: "invalid_oauth_state",
        message: "OAuth state mismatch. Restart the Discord login flow.",
      });
    }

    reply.clearCookie("discord_oauth_state", { path: "/" });
    reply.clearCookie(OAUTH_CLIENT_COOKIE, { path: "/" });

    if (!request.query.code) {
      return reply.code(400).send({
        ok: false,
        error: "missing_oauth_code",
      });
    }

    try {
      const accessToken = await exchangeDiscordCode(config, request.query.code);
      const profile = await fetchDiscordProfile(accessToken);
      const user = await upsertDiscordUser(db, {
        discordId: profile.id,
        username: profile.username,
        globalName: profile.globalName,
        avatar: profile.avatar,
      });
      const session = await createSession(db, user.user_id);

      if (oauthClient === "desktop") {
        const handoff = await createHandoffCode(db, session.token);
        return reply.redirect(`playnext://auth/callback?handoff=${handoff}`);
      }

      reply.setCookie(
        SESSION_COOKIE,
        session.token,
        sessionCookieOptions(config),
      );

      return reply.redirect(`${config.APP_URL}/?auth=ok`);
    } catch (error) {
      request.log.error({ err: error }, "Discord OAuth callback failed");
      if (oauthClient === "desktop") {
        return reply.redirect("playnext://auth/callback?error=exchange_failed");
      }
      return reply.redirect(
        `${config.APP_URL}/?auth=error&reason=exchange_failed`,
      );
    }
  });

  app.post<{
    Body: { code?: string };
  }>("/auth/handoff/exchange", async (request, reply) => {
    const sessionToken = await consumeHandoffCode(db, request.body?.code);
    if (!sessionToken) {
      return reply.code(400).send({
        ok: false,
        error: "invalid_handoff",
        message: "Handoff code invalid, expired, or already used.",
      });
    }

    const user = await findUserBySessionToken(db, sessionToken);
    if (!user) {
      return reply.code(400).send({
        ok: false,
        error: "invalid_handoff_session",
      });
    }

    return {
      ok: true,
      token: sessionToken,
      user,
    };
  });

  app.get("/auth/me", async (request, reply) => {
    const user = await findUserBySessionToken(db, getSessionToken(request));

    if (!user) {
      return reply.code(401).send({
        ok: false,
        error: "unauthenticated",
        message: "No active session.",
      });
    }

    return { ok: true, user };
  });

  app.post("/auth/logout", async (request, reply) => {
    await revokeSession(db, getSessionToken(request));
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/auth/discord/status", async () => ({
    ok: true,
    configured: isDiscordConfigured(config),
    scopes: DISCORD_SCOPES,
    redirectUri: config.DISCORD_REDIRECT_URI,
    desktopScheme: "playnext",
  }));
};
