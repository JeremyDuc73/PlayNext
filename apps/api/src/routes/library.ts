import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { PoolClient } from "pg";
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
import { filterJunkGames, isJunkGameName, normalizeGameTitle, resolveGroupPlayable } from "../library/filter.js";
import { riotCoverUrl } from "../meta/covers.js";
import { persistMissingGroupPlayable, loadGroupPlayableByTitle } from "../steam/store.js";

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

const riotGameSchema = z.object({
  externalId: z.enum(["league_of_legends", "valorant"]),
  name: z.enum(["League of Legends", "VALORANT"]),
  installed: z.literal(true),
  owned: z.literal(true),
  launchable: z.literal(true),
});

const riotSyncBodySchema = z.object({
  games: z.array(riotGameSchema).max(2).default([]),
});

const hiddenGameSchema = z.object({
  launcher: z.string().min(1).max(32),
  externalId: z.string().min(1).max(256),
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

  async function syncSourceGames(
    client: PoolClient,
    userId: string,
    launcher: string,
    sourceGames: Array<{
      externalId: string;
      name: string;
      installed: boolean;
      owned: boolean;
      launchable: boolean;
    }>,
  ): Promise<void> {
    const games = new Map(
      sourceGames.map((game) => [`${launcher}:${game.externalId}`, game]),
    );
    for (const game of games.values()) {
      await client.query(
        `
          INSERT INTO user_games (
            user_id, launcher, external_id, name,
            installed, owned, launchable, hidden, synced_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, false, now())
          ON CONFLICT (user_id, launcher, external_id) DO UPDATE SET
            name = EXCLUDED.name,
            installed = EXCLUDED.installed,
            owned = EXCLUDED.owned,
            launchable = EXCLUDED.launchable,
            synced_at = now(),
            updated_at = now()
        `,
        [
          userId,
          launcher,
          game.externalId,
          game.name,
          game.installed,
          game.owned,
          game.launchable,
        ],
      );
    }

    const externalIds = [...games.values()].map((game) => game.externalId);
    if (externalIds.length === 0) {
      await client.query(
        `DELETE FROM user_games WHERE user_id = $1 AND launcher = $2`,
        [userId, launcher],
      );
    } else {
      await client.query(
        `
          DELETE FROM user_games
          WHERE user_id = $1
            AND launcher = $2
            AND NOT (external_id = ANY($3::text[]))
        `,
        [userId, launcher, externalIds],
      );
    }
  }

  app.get("/library/steam/status", async () => ({
    ok: true,
    ownedApiConfigured: Boolean(config.STEAM_WEB_API_KEY),
  }));

  app.post("/library/riot/sync", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) {
      return reply.code(401).send({ ok: false, error: "unauthenticated" });
    }

    const parsed = riotSyncBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: "invalid_body",
        details: parsed.error.flatten(),
      });
    }

    const client = await db.pool.connect();
    try {
      await client.query("begin");
      await syncSourceGames(client, userId, "riot", parsed.data.games);
      for (const game of parsed.data.games) {
        const coverUrl = riotCoverUrl("riot", game.externalId);
        if (!coverUrl) continue;
        await client.query(
          `
            INSERT INTO game_meta (
              launcher, external_id, name, cover_url, source,
              group_playable, group_playable_source, fetched_at
            )
            VALUES ('riot', $1, $2, $3, 'twitch_boxart', true, 'riot', now())
            ON CONFLICT (launcher, external_id) DO UPDATE SET
              name = EXCLUDED.name,
              cover_url = EXCLUDED.cover_url,
              source = EXCLUDED.source,
              group_playable = EXCLUDED.group_playable,
              group_playable_source = EXCLUDED.group_playable_source,
              fetched_at = now()
            WHERE game_meta.source <> 'igdb_manual'
          `,
          [game.externalId, game.name, coverUrl],
        );
      }
      await client.query(
        `
          INSERT INTO library_sync_runs (user_id, source, game_count)
          VALUES ($1, 'riot', $2)
        `,
        [userId, parsed.data.games.length],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      request.log.error({ err: error }, "Riot library sync failed");
      return reply.code(500).send({ ok: false, error: "sync_failed" });
    } finally {
      client.release();
    }

    return {
      ok: true,
      synced: parsed.data.games.length,
      installed: parsed.data.games.length,
      source: "riot",
    };
  });

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
      await syncSourceGames(client, userId, "xbox", games);
      for (const game of games) {
        if (!game.imageUrl) continue;
        await client.query(
          `
            INSERT INTO game_meta (
              launcher, external_id, name, cover_url, source, fetched_at
            )
            VALUES ($1, $2, $3, $4, 'xbox_titlehub', now())
            ON CONFLICT (launcher, external_id) DO UPDATE SET
              name = EXCLUDED.name,
              cover_url = EXCLUDED.cover_url,
              source = EXCLUDED.source,
              fetched_at = now()
          `,
          [game.launcher, game.externalId, game.name, game.imageUrl],
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
      await syncSourceGames(client, userId, "epic", games);
      for (const game of games) {
        if (!game.imageUrl) continue;
        await client.query(
          `
            INSERT INTO game_meta (
              launcher, external_id, name, cover_url, source, fetched_at
            )
            VALUES ($1, $2, $3, $4, 'epic_catalog', now())
            ON CONFLICT (launcher, external_id) DO UPDATE SET
              name = EXCLUDED.name,
              cover_url = COALESCE(EXCLUDED.cover_url, game_meta.cover_url),
              source = EXCLUDED.source,
              fetched_at = now()
          `,
          [game.launcher, game.externalId, game.name, game.imageUrl],
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

    games = filterJunkGames(games);

    const client = await db.pool.connect();
    try {
      await client.query("begin");

      await syncSourceGames(client, userId, "steam", games);

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

    void persistMissingGroupPlayable(
      db,
      games.map((game) => ({
        launcher: "steam",
        externalId: game.externalId,
        name: game.name,
      })),
    ).catch((error) => {
      request.log.warn({ err: error }, "steam_group_playable_enrich_failed");
    });

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

  app.get("/library/hidden", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) {
      return reply.code(401).send({ ok: false, error: "unauthenticated" });
    }

    const result = await db.pool.query<{
      launcher: string;
      external_id: string;
      name: string;
      created_at: Date;
      installed: boolean | null;
      owned: boolean | null;
      launchable: boolean | null;
      cover_url: string | null;
      year: number | null;
    }>(
      `
        SELECT h.launcher, h.external_id, h.name, h.created_at,
               ug.installed, ug.owned, ug.launchable,
               gm.cover_url, gm.year
        FROM user_hidden_games h
        LEFT JOIN user_games ug
          ON ug.user_id = h.user_id
         AND ug.launcher = h.launcher
         AND ug.external_id = h.external_id
        LEFT JOIN game_meta gm
          ON gm.launcher = h.launcher
         AND gm.external_id = h.external_id
        WHERE h.user_id = $1
        ORDER BY h.name ASC
      `,
      [userId],
    );

    return {
      ok: true,
      games: result.rows.map((row) => ({
        id: `${row.launcher}:${row.external_id}`,
        launcher: row.launcher,
        externalId: row.external_id,
        name: row.name,
        installed: Boolean(row.installed),
        owned: row.owned ?? true,
        launchable: row.launchable ?? false,
        coverUrl:
          row.cover_url ?? riotCoverUrl(row.launcher, row.external_id),
        year: row.year,
        hiddenAt: row.created_at,
      })),
    };
  });

  app.post("/library/hide", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) {
      return reply.code(401).send({ ok: false, error: "unauthenticated" });
    }

    const parsed = hiddenGameSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "invalid_body" });
    }

    const game = await db.pool.query<{ name: string }>(
      `
        SELECT name
        FROM user_games
        WHERE user_id = $1 AND launcher = $2 AND external_id = $3
          AND owned = true
        LIMIT 1
      `,
      [userId, parsed.data.launcher, parsed.data.externalId],
    );
    if (!game.rows[0]) {
      return reply.code(404).send({
        ok: false,
        error: "game_not_in_library",
        message: "Jeu absent de ta bibliothèque.",
      });
    }

    await db.pool.query(
      `
        INSERT INTO user_hidden_games (user_id, launcher, external_id, name)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, launcher, external_id) DO UPDATE
          SET name = EXCLUDED.name
      `,
      [
        userId,
        parsed.data.launcher,
        parsed.data.externalId,
        game.rows[0].name,
      ],
    );
    await db.pool.query(
      `
        UPDATE user_games
        SET hidden = true, updated_at = now()
        WHERE user_id = $1 AND launcher = $2 AND external_id = $3
      `,
      [userId, parsed.data.launcher, parsed.data.externalId],
    );
    return { ok: true };
  });

  app.post("/library/unhide", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) {
      return reply.code(401).send({ ok: false, error: "unauthenticated" });
    }

    const parsed = hiddenGameSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "invalid_body" });
    }

    await db.pool.query(
      `
        DELETE FROM user_hidden_games
        WHERE user_id = $1 AND launcher = $2 AND external_id = $3
      `,
      [userId, parsed.data.launcher, parsed.data.externalId],
    );
    await db.pool.query(
      `
        UPDATE user_games
        SET hidden = false, updated_at = now()
        WHERE user_id = $1 AND launcher = $2 AND external_id = $3
      `,
      [userId, parsed.data.launcher, parsed.data.externalId],
    );
    return { ok: true };
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
      cover_url: string | null;
      year: number | null;
      group_playable: boolean | null;
    }>(
      `
        SELECT ug.id, ug.launcher, ug.external_id, ug.name, ug.installed,
               ug.owned, ug.launchable, ug.synced_at,
               CASE
                 WHEN gm.cover_url LIKE '%images.igdb.com%'
                  AND gm.source <> 'igdb_manual' THEN NULL
                 ELSE gm.cover_url
               END AS cover_url,
               gm.year, gm.group_playable
        FROM user_games ug
        LEFT JOIN game_meta gm
          ON gm.launcher = ug.launcher AND gm.external_id = ug.external_id
        LEFT JOIN user_hidden_games uh
          ON uh.user_id = ug.user_id
         AND uh.launcher = ug.launcher
         AND uh.external_id = ug.external_id
        WHERE ug.user_id = $1
          AND ug.hidden = false
          AND uh.user_id IS NULL
        ORDER BY ug.name ASC
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

    const byTitle = await loadGroupPlayableByTitle(db);
    const mapped = games.rows
      .filter((row) => !isJunkGameName(row.name))
      .map((row) => ({
        id: row.id,
        launcher: row.launcher,
        externalId: row.external_id,
        name: row.name,
        installed: row.installed,
        owned: row.owned,
        launchable: row.launchable,
        syncedAt: row.synced_at,
        coverUrl:
          row.cover_url ?? riotCoverUrl(row.launcher, row.external_id),
        year: row.year,
        groupPlayable: resolveGroupPlayable({
          name: row.name,
          launcher: row.launcher,
          stored: row.group_playable,
          byTitle: byTitle.get(normalizeGameTitle(row.name)),
        }),
      }));

    void persistMissingGroupPlayable(
      db,
      mapped.map((game) => ({
        launcher: game.launcher,
        externalId: game.externalId,
        name: game.name,
      })),
    ).catch((error) => {
      request.log.warn({ err: error }, "group_playable_enrich_failed");
    });

    return {
      ok: true,
      games: mapped,
      lastSync: lastSync.rows[0]
        ? {
            at: lastSync.rows[0].created_at,
            gameCount: lastSync.rows[0].game_count,
          }
        : null,
    };
  });
};
