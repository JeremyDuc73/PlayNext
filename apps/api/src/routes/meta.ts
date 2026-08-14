import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { getSessionToken } from "../auth/request-session.js";
import { findUserBySessionToken } from "../auth/session.js";
import type { Db } from "../db.js";
import {
  metaKey,
  riotCoverUrl,
  steamCoverFallbackUrls,
  steamLibraryPosterUrl,
} from "../meta/covers.js";
import { fetchSteamCoverAssets } from "../steam/assets.js";

type MetaRoutesOptions = {
  db: Db;
};

const itemSchema = z.object({
  launcher: z.string().min(1).max(32),
  externalId: z.string().min(1).max(256),
  name: z.string().min(1).max(256),
});

const resolveBodySchema = z.object({
  items: z.array(itemSchema).min(1).max(500),
});

/**
 * Covers launcher uniquement (Steam CDN + cache TitleHub/Epic).
 * Pas d’IGDB, pas de fiche détail.
 */
export const metaRoutes: FastifyPluginAsync<MetaRoutesOptions> = async (
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

  app.get("/meta/status", async () => ({
    ok: true,
    steamCdn: true,
  }));

  app.post("/meta/resolve", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) {
      return reply.code(401).send({ ok: false, error: "unauthenticated" });
    }

    const parsed = resolveBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "invalid_body" });
    }

    const unique = new Map<string, (typeof parsed.data.items)[number]>();
    for (const item of parsed.data.items) {
      unique.set(metaKey(item.launcher, item.externalId), item);
    }
    const items = [...unique.values()];

    const launchers = items.map((i) => i.launcher);
    const ids = items.map((i) => i.externalId);
    const cached = await db.pool.query<{
      launcher: string;
      external_id: string;
      cover_url: string | null;
      source: string;
    }>(
      `
        SELECT gm.launcher, gm.external_id, gm.cover_url, gm.source
        FROM game_meta gm
        JOIN unnest($1::text[], $2::text[]) AS x(launcher, external_id)
          ON gm.launcher = x.launcher AND gm.external_id = x.external_id
      `,
      [launchers, ids],
    );
    const byKey = new Map(
      cached.rows.map((r) => [
        metaKey(r.launcher, r.external_id),
        r,
      ]),
    );

    const steamItems = items.filter((item) => {
      if (item.launcher !== "steam") return false;
      const row = byKey.get(metaKey(item.launcher, item.externalId));
      return !row?.cover_url || row.source !== "steam_cdn";
    });
    if (steamItems.length > 0) {
      const assets = await fetchSteamCoverAssets(
        steamItems.map((item) => item.externalId),
      );
      for (const item of steamItems) {
        const asset = assets.get(item.externalId.replace(/[^\d]/g, ""));
        if (!asset?.coverUrl) continue;
        await db.pool.query(
          `
            INSERT INTO game_meta (
              launcher, external_id, name, cover_url, source, fetched_at
            )
            VALUES ('steam', $1, $2, $3, 'steam_cdn', now())
            ON CONFLICT (launcher, external_id) DO UPDATE SET
              name = EXCLUDED.name,
              cover_url = EXCLUDED.cover_url,
              source = EXCLUDED.source,
              fetched_at = now()
            WHERE game_meta.source <> 'igdb_manual'
          `,
          [item.externalId, item.name, asset.coverUrl],
        );
        byKey.set(metaKey("steam", item.externalId), {
          launcher: "steam",
          external_id: item.externalId,
          cover_url: asset.coverUrl,
          source: "steam_cdn",
        });
      }
    }

    const results = items.map((item) => {
      const key = metaKey(item.launcher, item.externalId);
      const row = byKey.get(key);
      const cachedCover =
        row?.cover_url &&
        (item.launcher === "steam"
          ? row.source === "steam_cdn"
          : row.source === "igdb_manual" ||
            !row.cover_url.includes("images.igdb.com"))
          ? row.cover_url
          : null;
      const coverUrl =
        cachedCover ??
        (item.launcher === "steam"
          ? steamLibraryPosterUrl(item.externalId)
          : riotCoverUrl(item.launcher, item.externalId));

      return {
        key,
        launcher: item.launcher,
        externalId: item.externalId,
        name: item.name,
        coverUrl,
        fallbackUrls:
          item.launcher === "steam"
            ? steamCoverFallbackUrls(item.externalId)
            : [],
        year: null as number | null,
        genres: [] as string[],
        source:
          (row?.source === "igdb" ? null : row?.source) ??
          (item.launcher === "steam"
            ? "steam_cdn"
            : item.launcher === "riot"
              ? "twitch_boxart"
              : "none"),
      };
    });

    return { ok: true, results };
  });
};
