import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { getSessionToken } from "../auth/request-session.js";
import { findUserBySessionToken } from "../auth/session.js";
import type { Db } from "../db.js";
import { searchSteamCatalog } from "../steam/catalog.js";

type SteamRoutesOptions = {
  db: Db;
};

export const steamRoutes: FastifyPluginAsync<SteamRoutesOptions> = async (
  app,
  opts,
) => {
  const { db } = opts;

  async function requireUserId(
    request: FastifyRequest,
  ): Promise<string | null> {
    const user = await findUserBySessionToken(db, getSessionToken(request));
    return user?.id ?? null;
  }

  app.get<{ Querystring: { q?: string } }>(
    "/steam/search",
    async (request, reply) => {
      const userId = await requireUserId(request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }
      const query = (request.query.q ?? "").trim();
      if (query.length < 2) {
        return reply.code(400).send({
          ok: false,
          error: "invalid_query",
          message: "Deux caractères minimum.",
        });
      }
      const lookup = await searchSteamCatalog(query);
      if (lookup.status === "retry") {
        return reply.code(503).send({
          ok: false,
          error: "steam_unavailable",
          message: "Store Steam injoignable.",
        });
      }
      return { ok: true, results: lookup.hits };
    },
  );
};
