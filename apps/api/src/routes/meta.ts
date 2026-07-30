import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { getSessionToken } from "../auth/request-session.js";
import { findUserBySessionToken } from "../auth/session.js";
import type { Db } from "../db.js";
import {
  metaKey,
  steamCoverFallbackUrls,
  steamLibraryPosterUrl,
} from "../meta/covers.js";

type MetaRoutesOptions = {
  db: Db;
};

const itemSchema = z.object({
  launcher: z.string().min(1).max(32),
  externalId: z.string().min(1).max(256),
  name: z.string().min(1).max(256),
});

const resolveBodySchema = z.object({
  items: z.array(itemSchema).min(1).max(80),
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

    const results = items.map((item) => {
      const key = metaKey(item.launcher, item.externalId);
      const row = byKey.get(key);
      const coverUrl =
        row?.cover_url ??
        (item.launcher === "steam"
          ? steamLibraryPosterUrl(item.externalId, "_2x")
          : null);

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
          row?.source ??
          (item.launcher === "steam" ? "steam_cdn" : "none"),
      };
    });

    return { ok: true, results };
  });
};
