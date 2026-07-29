import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Env } from "../config.js";
import { isMicrosoftConfigured } from "../config.js";
import type { Db } from "../db.js";
import { getSessionToken } from "../auth/request-session.js";
import { findUserBySessionToken } from "../auth/session.js";
import { getValidXboxSession } from "../microsoft/tokens.js";
import {
  fetchTitleHistory,
  fetchTitlesByPfns,
  mergeXboxLibrary,
} from "../microsoft/xbox.js";
import { fetchSteamOwnedGames, mergeSteamLibrary } from "../steam/owned.js";
import { getValidEpicAccessToken } from "../epic/tokens.js";
import { fetchEpicLibrary, mergeEpicLibrary } from "../epic/library.js";

type LibraryRoutesOptions = {
  db: Db;
  config: Env;
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
  steamId: z
    .string()
    .regex(/^7656\d{13}$/)
    .optional(),
});

const xboxInstalledSchema = z.object({
  externalId: z.string().min(1).max(256),
  name: z.string().min(1).max(256).optional(),
});

const xboxSyncBodySchema = z.object({
  installed: z.array(xboxInstalledSchema).max(5000).default([]),
});

const epicInstalledSchema = z.object({
  externalId: z.string().min(1).max(256),
  name: z.string().min(1).max(256).optional(),
});

const epicSyncBodySchema = z.object({
  installed: z.array(epicInstalledSchema).max(5000).default([]),
});

export const libraryRoutes: FastifyPluginAsync<LibraryRoutesOptions> = async (
  app,
  opts,
) => {
  const { db, config } = opts;

  async function requireUserId(request: FastifyRequest): Promise<string | null> {
    const user = await findUserBySessionToken(db, getSessionToken(request));
    return user?.id ?? null;
  }

  app.get("/library/steam/status", async () => ({
    ok: true,
    ownedApiConfigured: Boolean(config.STEAM_WEB_API_KEY),
  }));

  app.post("/library/xbox/sync", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) {
      return reply.code(401).send({ ok: false, error: "unauthenticated" });
    }
    if (!isMicrosoftConfigured(config)) {
      return reply.code(503).send({
        ok: false,
        error: "microsoft_not_configured",
      });
    }

    const parsed = xboxSyncBodySchema.safeParse(request.body ?? {});
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
      "installDir" in raw ||
      "installPath" in raw
    ) {
      return reply.code(400).send({
        ok: false,
        error: "paths_forbidden",
        message: "Local paths must not be synchronized.",
      });
    }

    let session;
    try {
      session = await getValidXboxSession(db, config, userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "xbox_session";
      if (message === "microsoft_not_linked") {
        return reply.code(400).send({
          ok: false,
          error: "microsoft_not_linked",
          message: "Connecte d’abord ton compte Microsoft / Xbox.",
        });
      }
      request.log.warn({ err: error }, "Xbox session failed");
      return reply.code(502).send({
        ok: false,
        error: "xbox_auth_failed",
        message:
          "Impossible de rafraîchir la session Xbox. Reconnecte ton compte Microsoft.",
      });
    }

    const installed = parsed.data.installed;
    let history;
    try {
      history = await fetchTitleHistory(session);
    } catch (error) {
      request.log.warn({ err: error }, "Xbox title history failed");
      return reply.code(502).send({
        ok: false,
        error: "xbox_library_failed",
        message: "Impossible de récupérer l’historique Xbox / PC.",
      });
    }

    const historyPfns = new Set(history.map((t) => t.pfn.toLowerCase()));
    const unknownInstalled = installed
      .map((g) => g.externalId)
      .filter((pfn) => !historyPfns.has(pfn.toLowerCase()))
      .slice(0, 80);

    let installedOnlyTitles: Awaited<ReturnType<typeof fetchTitlesByPfns>> =
      [];
    try {
      installedOnlyTitles = await fetchTitlesByPfns(session, unknownInstalled);
    } catch (error) {
      request.log.warn({ err: error }, "Xbox batch title info failed");
      installedOnlyTitles = [];
    }

    const games = mergeXboxLibrary(history, installed, installedOnlyTitles);

    const client = await db.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `
          DELETE FROM user_games
          WHERE user_id = $1 AND launcher = 'xbox'
        `,
        [userId],
      );

      for (const game of games) {
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
          VALUES ($1, 'xbox', $2)
        `,
        [userId, games.length],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      request.log.error({ err: error }, "xbox library sync failed");
      return reply.code(500).send({ ok: false, error: "sync_failed" });
    } finally {
      client.release();
    }

    const installedCount = games.filter((g) => g.installed).length;
    return {
      ok: true,
      synced: games.length,
      installed: installedCount,
      historyCount: history.length,
      installedOnlyCount: installedOnlyTitles.length,
      source: "xbox",
      hint:
        "Les titres Game Pass jamais lancés peuvent manquer (même limite que Playnite).",
    };
  });

  app.post("/library/epic/sync", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) {
      return reply.code(401).send({ ok: false, error: "unauthenticated" });
    }

    const parsed = epicSyncBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: "invalid_body",
        details: parsed.error.flatten(),
      });
    }

    const raw = request.body as Record<string, unknown>;
    if (
      "path" in raw ||
      "installDir" in raw ||
      "installPath" in raw ||
      "InstallLocation" in raw
    ) {
      return reply.code(400).send({
        ok: false,
        error: "paths_forbidden",
        message: "Local paths must not be synchronized.",
      });
    }

    let access;
    try {
      access = await getValidEpicAccessToken(db, config, userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "epic_session";
      if (message === "epic_not_linked") {
        return reply.code(400).send({
          ok: false,
          error: "epic_not_linked",
          message: "Connecte d’abord ton compte Epic.",
        });
      }
      request.log.warn({ err: error }, "Epic session failed");
      return reply.code(502).send({
        ok: false,
        error: "epic_auth_failed",
        message: "Session Epic expirée. Reconnecte ton compte.",
      });
    }

    let owned;
    try {
      owned = await fetchEpicLibrary(access.accessToken, access.tokenType);
    } catch (error) {
      request.log.warn({ err: error }, "Epic library fetch failed");
      return reply.code(502).send({
        ok: false,
        error: "epic_library_failed",
        message: "Impossible de récupérer la bibliothèque Epic.",
      });
    }

    const games = mergeEpicLibrary(owned, parsed.data.installed);

    const client = await db.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `
          DELETE FROM user_games
          WHERE user_id = $1 AND launcher = 'epic'
        `,
        [userId],
      );

      for (const game of games) {
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
          VALUES ($1, 'epic', $2)
        `,
        [userId, games.length],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      request.log.error({ err: error }, "epic library sync failed");
      return reply.code(500).send({ ok: false, error: "sync_failed" });
    } finally {
      client.release();
    }

    const installedCount = games.filter((g) => g.installed).length;
    return {
      ok: true,
      synced: games.length,
      installed: installedCount,
      ownedCount: owned.length,
      source: "epic",
    };
  });

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

    let games = parsed.data.games;
    let ownedEnriched = false;
    let ownedCount = 0;

    if (parsed.data.steamId && config.STEAM_WEB_API_KEY) {
      try {
        const owned = await fetchSteamOwnedGames(
          config.STEAM_WEB_API_KEY,
          parsed.data.steamId,
        );
        ownedCount = owned.length;
        games = mergeSteamLibrary(parsed.data.games, owned);
        ownedEnriched = true;
      } catch (error) {
        request.log.warn({ err: error }, "Steam owned enrichment failed");
        return reply.code(502).send({
          ok: false,
          error: "steam_owned_failed",
          message:
            "Impossible de récupérer la bibliothèque Steam possédée. Réessaie ou vérifie la clé API.",
        });
      }
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

      for (const game of games) {
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
        [userId, parsed.data.source, games.length],
      );

      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      request.log.error({ err: error }, "library sync failed");
      return reply.code(500).send({ ok: false, error: "sync_failed" });
    } finally {
      client.release();
    }

    const installed = games.filter((g) => g.installed).length;

    return {
      ok: true,
      synced: games.length,
      installed,
      ownedEnriched,
      ownedCount,
      source: "steam",
      hint: ownedEnriched
        ? undefined
        : config.STEAM_WEB_API_KEY
          ? "Ajoute un steamId local pour enrichir avec les jeux non installés."
          : "Configure STEAM_WEB_API_KEY pour synchroniser aussi les jeux non installés.",
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
