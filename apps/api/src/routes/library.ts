import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db.js";
import { getSessionToken } from "../auth/request-session.js";
import { findUserBySessionToken } from "../auth/session.js";

type LibraryRoutesOptions = {
  db: Db;
};

const syncGameSchema = z.object({
  launcher: z.literal("steam"),
  externalId: z.string().min(1).max(64),
  name: z.string().min(1).max(256),
  installed: z.boolean(),
  owned: z.boolean(),
  launchable: z.boolean(),
});

const syncBodySchema = z.object({
  games: z.array(syncGameSchema).max(5000),
  source: z.literal("steam").default("steam"),
});

export const libraryRoutes: FastifyPluginAsync<LibraryRoutesOptions> = async (
  app,
  opts,
) => {
  const { db } = opts;

  async function requireUserId(request: FastifyRequest): Promise<string | null> {
    const user = await findUserBySessionToken(db, getSessionToken(request));
    return user?.id ?? null;
  }

  app.post("/library/sync", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) {
      return reply.code(401).send({ ok: false, error: "unauthenticated" });
    }

    const parsed = syncBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: "invalid_body",
        details: parsed.error.flatten(),
      });
    }

    const raw = request.body as Record<string, unknown>;
    if (
      "steamPath" in raw ||
      "libraryPaths" in raw ||
      "path" in raw ||
      "installDir" in raw
    ) {
      return reply.code(400).send({
        ok: false,
        error: "paths_forbidden",
        message: "Local paths must not be synchronized.",
      });
    }

    const client = await db.pool.connect();
    try {
      await client.query("begin");

      await client.query(
        `
          DELETE FROM user_games
          WHERE user_id = $1 AND launcher = 'steam'
        `,
        [userId],
      );

      for (const game of parsed.data.games) {
        await client.query(
          `
            INSERT INTO user_games (
              user_id, launcher, external_id, name,
              installed, owned, launchable, hidden, synced_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, false, now())
          `,
          [
            userId,
            game.launcher,
            game.externalId,
            game.name,
            game.installed,
            game.owned,
            game.launchable,
          ],
        );
      }

      await client.query(
        `
          INSERT INTO library_sync_runs (user_id, source, game_count)
          VALUES ($1, $2, $3)
        `,
        [userId, parsed.data.source, parsed.data.games.length],
      );

      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      request.log.error({ err: error }, "library sync failed");
      return reply.code(500).send({ ok: false, error: "sync_failed" });
    } finally {
      client.release();
    }

    const installed = parsed.data.games.filter((g) => g.installed).length;

    return {
      ok: true,
      synced: parsed.data.games.length,
      installed,
      source: "steam",
    };
  });

  app.get("/library/me", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) {
      return reply.code(401).send({ ok: false, error: "unauthenticated" });
    }

    const games = await db.pool.query<{
      id: string;
      launcher: string;
      external_id: string;
      name: string;
      installed: boolean;
      owned: boolean;
      launchable: boolean;
      synced_at: Date;
    }>(
      `
        SELECT id, launcher, external_id, name, installed, owned, launchable, synced_at
        FROM user_games
        WHERE user_id = $1 AND hidden = false
        ORDER BY name ASC
      `,
      [userId],
    );

    const lastSync = await db.pool.query<{ created_at: Date; game_count: number }>(
      `
        SELECT created_at, game_count
        FROM library_sync_runs
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [userId],
    );

    return {
      ok: true,
      games: games.rows.map((row) => ({
        id: row.id,
        launcher: row.launcher,
        externalId: row.external_id,
        name: row.name,
        installed: row.installed,
        owned: row.owned,
        launchable: row.launchable,
        syncedAt: row.synced_at,
      })),
      lastSync: lastSync.rows[0]
        ? {
            at: lastSync.rows[0].created_at,
            gameCount: lastSync.rows[0].game_count,
          }
        : null,
    };
  });
};
