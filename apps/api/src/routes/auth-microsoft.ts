import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { randomBytes } from "node:crypto";
import type { Env } from "../config.js";
import { isMicrosoftConfigured } from "../config.js";
import type { Db } from "../db.js";
import { getSessionToken } from "../auth/request-session.js";
import { findUserBySessionToken } from "../auth/session.js";
import {
  buildMicrosoftAuthorizeUrl,
  createPkcePair,
} from "../microsoft/oauth.js";
import {
  deleteMicrosoftLink,
  getMicrosoftLinkStatus,
  saveMicrosoftLinkFromCode,
} from "../microsoft/tokens.js";

type AuthMicrosoftRoutesOptions = {
  config: Env;
  db: Db;
};

export const authMicrosoftRoutes: FastifyPluginAsync<
  AuthMicrosoftRoutesOptions
> = async (app, opts) => {
  const { config, db } = opts;

  async function requireUserId(
    request: FastifyRequest,
  ): Promise<string | null> {
    const user = await findUserBySessionToken(db, getSessionToken(request));
    return user?.id ?? null;
  }

  app.get("/auth/microsoft/status", async (request, reply) => {
    const configured = isMicrosoftConfigured(config);
    const userId = await requireUserId(request);
    if (!userId) {
      return {
        ok: true,
        configured,
        linked: false,
        xuid: null,
      };
    }
    const link = await getMicrosoftLinkStatus(db, userId);
    return {
      ok: true,
      configured,
      linked: link.linked,
      xuid: link.xuid,
    };
  });

  app.post("/auth/microsoft/start", async (request, reply) => {
    if (!isMicrosoftConfigured(config)) {
      return reply.code(503).send({
        ok: false,
        error: "microsoft_not_configured",
        message:
          "MICROSOFT_CLIENT_ID is required. See docs/XBOX.md to register an Entra app.",
      });
    }

    const userId = await requireUserId(request);
    if (!userId) {
      return reply.code(401).send({ ok: false, error: "unauthenticated" });
    }

    const body = (request.body ?? {}) as { client?: string };
    const client = body.client === "desktop" ? "desktop" : "web";
    const state = randomBytes(24).toString("hex");
    const pkce = createPkcePair();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.pool.query(
      `
        INSERT INTO oauth_pending (state, user_id, provider, client, code_verifier, expires_at)
        VALUES ($1, $2, 'microsoft', $3, $4, $5)
      `,
      [state, userId, client, pkce.verifier, expiresAt],
    );

    const url = buildMicrosoftAuthorizeUrl({
      clientId: config.MICROSOFT_CLIENT_ID,
      redirectUri: config.MICROSOFT_REDIRECT_URI,
      state,
      codeChallenge: pkce.challenge,
    });

    return { ok: true, url };
  });

  app.get<{
    Querystring: { code?: string; state?: string; error?: string };
  }>("/auth/microsoft/callback", async (request, reply) => {
    const pending = request.query.state
      ? await db.pool.query<{
          user_id: string;
          client: string;
          code_verifier: string | null;
        }>(
          `
            SELECT user_id, client, code_verifier
            FROM oauth_pending
            WHERE state = $1 AND provider = 'microsoft' AND expires_at > now()
          `,
          [request.query.state],
        )
      : {
          rows: [] as Array<{
            user_id: string;
            client: string;
            code_verifier: string | null;
          }>,
        };

    const row = pending.rows[0];
    const client = row?.client === "desktop" ? "desktop" : "web";

    const fail = (reason: string) => {
      if (client === "desktop") {
        return reply.redirect(
          `playnext://auth/microsoft?error=${encodeURIComponent(reason)}`,
        );
      }
      return reply.redirect(
        `${config.APP_URL}/?xbox=error&reason=${encodeURIComponent(reason)}`,
      );
    };

    if (request.query.error) {
      return fail(request.query.error);
    }
    if (
      !row ||
      !request.query.code ||
      !request.query.state ||
      !row.code_verifier
    ) {
      return fail("invalid_state");
    }

    await db.pool.query(`DELETE FROM oauth_pending WHERE state = $1`, [
      request.query.state,
    ]);

    try {
      await saveMicrosoftLinkFromCode(
        db,
        config,
        row.user_id,
        request.query.code,
        row.code_verifier,
      );
    } catch (error) {
      request.log.error({ err: error }, "Microsoft / Xbox link failed");
      const detail = error instanceof Error ? error.message : "";
      if (
        detail.includes("AADSTS70002") ||
        detail.includes("must include a 'client_secret'")
      ) {
        return fail("enable_public_client");
      }
      if (detail.includes("AADSTS70000") || detail.includes("invalid_grant")) {
        return fail("code_expired");
      }
      return fail("xbox_link_failed");
    }

    if (client === "desktop") {
      return reply.redirect("playnext://auth/microsoft?ok=1");
    }
    return reply.redirect(`${config.APP_URL}/?xbox=ok`);
  });

  app.post("/auth/microsoft/disconnect", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) {
      return reply.code(401).send({ ok: false, error: "unauthenticated" });
    }
    await deleteMicrosoftLink(db, userId);
    return { ok: true };
  });
};
