import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { randomBytes } from "node:crypto";
import type { Env } from "../config.js";
import { isEpicOAuthConfigured } from "../config.js";
import type { Db } from "../db.js";
import { getSessionToken } from "../auth/request-session.js";
import { findUserBySessionToken } from "../auth/session.js";
import { buildEpicLoginUrl } from "../epic/oauth.js";
import {
  deleteEpicLink,
  getEpicLinkStatus,
  saveEpicLinkFromCode,
} from "../epic/tokens.js";

type AuthEpicRoutesOptions = {
  config: Env;
  db: Db;
};

export const authEpicRoutes: FastifyPluginAsync<AuthEpicRoutesOptions> = async (
  app,
  opts,
) => {
  const { config, db } = opts;

  async function requireUserId(
    request: FastifyRequest,
  ): Promise<string | null> {
    const user = await findUserBySessionToken(db, getSessionToken(request));
    return user?.id ?? null;
  }

  app.get("/auth/epic/status", async (request) => {
    const userId = await requireUserId(request);
    if (!userId) {
      return { ok: true, linked: false, accountId: null, displayName: null };
    }
    const link = await getEpicLinkStatus(db, userId);
    return {
      ok: true,
      linked: link.linked,
      accountId: link.accountId,
      displayName: link.displayName,
    };
  });

  /** Starts Epic OAuth and returns to the app after login. */
  app.post("/auth/epic/start", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) {
      return reply.code(401).send({ ok: false, error: "unauthenticated" });
    }
    if (!isEpicOAuthConfigured(config)) {
      return reply.code(503).send({
        ok: false,
        error: "epic_oauth_not_configured",
        message:
          "Le client Epic PlayNext n’est pas configuré. Voir docs/EPIC.md.",
      });
    }
    const body = (request.body ?? {}) as { client?: string };
    const client = body.client === "desktop" ? "desktop" : "web";
    const state = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await db.pool.query(
      `
        INSERT INTO oauth_pending (state, user_id, provider, client, expires_at)
        VALUES ($1, $2, 'epic', $3, $4)
      `,
      [state, userId, client, expiresAt],
    );
    return {
      ok: true,
      url: buildEpicLoginUrl(config, state),
      hint: "La connexion revient automatiquement dans PlayNext.",
    };
  });

  app.get<{
    Querystring: {
      code?: string;
      authorizationCode?: string;
      state?: string;
      error?: string;
    };
  }>("/auth/epic/callback", async (request, reply) => {
    const pending = request.query.state
      ? await db.pool.query<{ user_id: string; client: string }>(
          `
            SELECT user_id, client
            FROM oauth_pending
            WHERE state = $1 AND provider = 'epic' AND expires_at > now()
          `,
          [request.query.state],
        )
      : { rows: [] as Array<{ user_id: string; client: string }> };
    const row = pending.rows[0];
    const client = row?.client === "desktop" ? "desktop" : "web";

    const fail = (reason: string) => {
      if (client === "desktop") {
        return reply.redirect(
          `playnext://auth/epic?error=${encodeURIComponent(reason)}`,
        );
      }
      return reply.redirect(
        `${config.APP_URL}/?epic=error&reason=${encodeURIComponent(reason)}`,
      );
    };

    if (request.query.error) return fail(request.query.error);
    const code = request.query.code ?? request.query.authorizationCode;
    if (!row || !request.query.state || !code) {
      return fail("invalid_state");
    }

    await db.pool.query(`DELETE FROM oauth_pending WHERE state = $1`, [
      request.query.state,
    ]);
    try {
      await saveEpicLinkFromCode(db, config, row.user_id, code);
    } catch (error) {
      request.log.error({ err: error }, "Epic callback failed");
      return fail("epic_link_failed");
    }

    if (client === "desktop") {
      return reply.redirect("playnext://auth/epic?ok=1");
    }
    return reply.redirect(`${config.APP_URL}/?epic=ok`);
  });

  app.post("/auth/epic/exchange", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) {
      return reply.code(401).send({ ok: false, error: "unauthenticated" });
    }

    const body = (request.body ?? {}) as { code?: string };
    const code = body.code?.trim();
    if (!code || code.length < 8) {
      return reply.code(400).send({
        ok: false,
        error: "invalid_code",
        message: "Colle le authorizationCode Epic (page après login).",
      });
    }

    try {
      await saveEpicLinkFromCode(db, config, userId, code);
    } catch (error) {
      request.log.error({ err: error }, "Epic link failed");
      return reply.code(502).send({
        ok: false,
        error: "epic_link_failed",
        message:
          "Code Epic invalide ou expiré. Reconnecte et colle un nouveau authorizationCode.",
      });
    }

    const link = await getEpicLinkStatus(db, userId);
    return {
      ok: true,
      linked: true,
      accountId: link.accountId,
      displayName: link.displayName,
    };
  });

  app.post("/auth/epic/disconnect", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) {
      return reply.code(401).send({ ok: false, error: "unauthenticated" });
    }
    await deleteEpicLink(db, userId);
    return { ok: true };
  });
};
