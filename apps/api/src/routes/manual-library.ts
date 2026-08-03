import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { isIgdbConfigured } from "../config.js";
import type { Env } from "../config.js";
import type { Db } from "../db.js";
import { getSessionToken } from "../auth/request-session.js";
import {
  findUserBySessionToken,
} from "../auth/session.js";
import {
  fetchManualGame,
  searchManualGames,
} from "../meta/igdb-manual.js";

type Options = {
  db: Db;
  config: Env;
};

const searchSchema = z.object({
  query: z.string().trim().min(2).max(100),
});

const addSchema = z.object({
  igdbId: z.number().int().positive(),
});

export const manualLibraryRoutes: FastifyPluginAsync<Options> = async (
  app,
  opts,
) => {
  const { db, config } = opts;

  async function requireUserId(
    request: FastifyRequest,
  ): Promise<string | null> {
    const user = await findUserBySessionToken(db, getSessionToken(request));
    return user?.id ?? null;
  }

  app.get("/library/manual/status", async () => ({
    ok: true,
    configured: isIgdbConfigured(config),
  }));

  app.post("/library/manual/search", async (request, reply) => {
    if (!(await requireUserId(request))) {
      return reply.code(401).send({ ok: false, error: "unauthenticated" });
    }
    if (!isIgdbConfigured(config)) {
      return reply.code(503).send({
        ok: false,
        error: "igdb_not_configured",
        message: "Ajoute les clés Twitch dans .env pour chercher un jeu.",
      });
    }
    const parsed = searchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "invalid_body" });
    }

    try {
      const results = await searchManualGames(config, parsed.data.query);
      return { ok: true, results };
    } catch {
      return reply.code(502).send({
        ok: false,
        error: "catalog_unavailable",
        message: "Catalogue IGDB indisponible.",
      });
    }
  });

  app.post("/library/manual", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) {
      return reply.code(401).send({ ok: false, error: "unauthenticated" });
    }
    if (!isIgdbConfigured(config)) {
      return reply.code(503).send({
        ok: false,
        error: "igdb_not_configured",
        message: "Ajoute les clés Twitch dans .env pour ajouter un jeu.",
      });
    }
    const parsed = addSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "invalid_body" });
    }

    const game = await fetchManualGame(config, parsed.data.igdbId);
    if (!game) {
      return reply.code(404).send({ ok: false, error: "game_not_found" });
    }

    await db.pool.query(
      `
        INSERT INTO user_games (
          user_id, launcher, external_id, name, installed, owned, launchable
        )
        VALUES ($1, 'manual', $2, $3, false, true, false)
        ON CONFLICT (user_id, launcher, external_id) DO UPDATE SET
          name = EXCLUDED.name,
          owned = true,
          updated_at = now()
      `,
      [userId, String(game.igdbId), game.name],
    );
    await db.pool.query(
      `
        INSERT INTO game_meta (
          launcher, external_id, name, igdb_id, cover_image_id,
          cover_url, year, source, fetched_at
        )
        VALUES ('manual', $1, $2, $3, $4, $5, $6, 'igdb_manual', now())
        ON CONFLICT (launcher, external_id) DO UPDATE SET
          name = EXCLUDED.name,
          igdb_id = EXCLUDED.igdb_id,
          cover_image_id = EXCLUDED.cover_image_id,
          cover_url = EXCLUDED.cover_url,
          year = EXCLUDED.year,
          source = 'igdb_manual',
          fetched_at = now()
      `,
      [
        String(game.igdbId),
        game.name,
        game.igdbId,
        game.coverImageId,
        game.coverUrl,
        game.year,
      ],
    );

    return {
      ok: true,
      game: {
        launcher: "manual",
        externalId: String(game.igdbId),
        name: game.name,
      },
    };
  });
};
