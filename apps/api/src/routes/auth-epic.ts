import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { createHash } from "node:crypto";
import type { Env } from "../config.js";
import type { Db } from "../db.js";
import { getSessionToken } from "../auth/request-session.js";
import { findUserBySessionToken } from "../auth/session.js";
import {
  deleteEpicLink,
  getEpicLinkStatus,
  saveEpicLinkFromCode,
} from "../epic/tokens.js";

type AuthEpicRoutesOptions = {
  config: Env;
  db: Db;
};

function epicCodeFingerprint(code: string): string {
  return createHash("sha256").update(code).digest("hex").slice(0, 12);
}

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
        message: "Code Epic absent ou expiré. Relance la connexion.",
      });
    }

    const codeFingerprint = epicCodeFingerprint(code);
    request.log.info(
      { codeLength: code.length, codeFingerprint },
      "Epic authorization code received",
    );

    try {
      await saveEpicLinkFromCode(db, config, userId, code);
    } catch (error) {
      request.log.error(
        { err: error, codeLength: code.length, codeFingerprint },
        "Epic link failed",
      );
      const detail = error instanceof Error ? error.message : "";
      const tokenStatus = detail.match(/^epic_token_(\d+)/)?.[1];
      return reply.code(502).send({
        ok: false,
        error: "epic_link_failed",
        message: tokenStatus
          ? `Échange Epic refusé (${tokenStatus}).`
          : "Code Epic invalide ou expiré. Relance la connexion.",
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
