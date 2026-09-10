import type { FastifyInstance } from "fastify";
import {
  type GroupsRoutesOptions,
  requireUserId,
  hideGameSchema,
} from "./helpers.js";
import { getMembership } from "../../groups/membership.js";
import { toPublicUser } from "../../auth/session.js";
import {
  isJunkGameName,
  isVisibleInGroup,
  launcherRank,
  mergeGroupPlayable,
  normalizeGameTitle,
  resolveGroupPlayable,
} from "../../library/filter.js";
import { riotCoverUrl } from "../../meta/covers.js";
import {
  persistMissingGroupPlayable,
  loadGroupPlayableByTitle,
} from "../../steam/store.js";

export function registerGroupLibraryRoutes(
  app: FastifyInstance,
  opts: GroupsRoutesOptions,
) {
  const { db, config } = opts;

  app.get<{ Params: { groupId: string } }>(
    "/groups/:groupId/library",
    async (request, reply) => {
      const userId = await requireUserId(db, request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }

      const membership = await getMembership(
        db,
        request.params.groupId,
        userId,
      );
      if (!membership) {
        return reply.code(404).send({ ok: false, error: "group_not_found" });
      }

      const members = await db.pool.query<{
        user_id: string;
        discord_id: string;
        username: string;
        global_name: string | null;
        avatar: string | null;
      }>(
        `
          SELECT u.id AS user_id, u.discord_id, u.username, u.global_name, u.avatar
          FROM group_members m
          JOIN users u ON u.id = m.user_id
          WHERE m.group_id = $1
        `,
        [request.params.groupId],
      );
      const memberCount = members.rows.length;

      const games = await db.pool.query<{
        launcher: string;
        external_id: string;
        name: string;
        installed: boolean;
        launchable: boolean;
        user_id: string;
        discord_id: string;
        username: string;
        global_name: string | null;
        avatar: string | null;
        group_playable: boolean | null;
      }>(
        `
          SELECT ug.launcher, ug.external_id, ug.name, ug.installed, ug.launchable,
                 u.id AS user_id, u.discord_id, u.username, u.global_name, u.avatar,
                 gm.group_playable
          FROM group_members m
          JOIN users u ON u.id = m.user_id
          JOIN user_games ug ON ug.user_id = m.user_id
          LEFT JOIN game_meta gm
            ON gm.launcher = ug.launcher AND gm.external_id = ug.external_id
          WHERE m.group_id = $1
            AND ug.owned = true
            AND ug.hidden = false
            AND NOT EXISTS (
              SELECT 1 FROM user_hidden_games uh
              WHERE uh.user_id = ug.user_id
                AND uh.launcher = ug.launcher
                AND uh.external_id = ug.external_id
            )
            AND NOT EXISTS (
              SELECT 1 FROM group_hidden_games h
              WHERE h.group_id = m.group_id
                AND h.user_id = m.user_id
                AND h.launcher = ug.launcher
                AND h.external_id = ug.external_id
            )
          ORDER BY ug.name ASC
        `,
        [request.params.groupId],
      );

      void persistMissingGroupPlayable(
        db,
        games.rows.map((row) => ({
          launcher: row.launcher,
          externalId: row.external_id,
          name: row.name,
        })),
        config,
      ).catch((error) => {
        request.log.warn({ err: error }, "group_playable_enrich_failed");
      });

      const playableByTitle = await loadGroupPlayableByTitle(db);

      type Owner = {
        userId: string;
        displayName: string;
        username: string;
        avatarUrl: string | null;
        installed: boolean;
        launchable: boolean;
      };

      const byTitle = new Map<
        string,
        {
          launcher: string;
          externalId: string;
          name: string;
          owners: Map<string, Owner>;
          groupPlayable: boolean | null;
        }
      >();

      for (const row of games.rows) {
        if (isJunkGameName(row.name)) continue;
        const titleKey = normalizeGameTitle(row.name);
        if (!titleKey) continue;

        const publicUser = toPublicUser({
          user_id: row.user_id,
          discord_id: row.discord_id,
          username: row.username,
          global_name: row.global_name,
          avatar: row.avatar,
        });
        const owner: Owner = {
          userId: publicUser.id,
          displayName: publicUser.displayName,
          username: publicUser.username,
          avatarUrl: publicUser.avatarUrl,
          installed: row.installed,
          launchable: row.launchable,
        };

        const rowGroupPlayable = resolveGroupPlayable({
          name: row.name,
          launcher: row.launcher,
          stored: row.group_playable,
          byTitle: playableByTitle.get(titleKey),
        });

        const existing = byTitle.get(titleKey);
        if (!existing) {
          byTitle.set(titleKey, {
            launcher: row.launcher,
            externalId: row.external_id,
            name: row.name,
            owners: new Map([[owner.userId, owner]]),
            groupPlayable: rowGroupPlayable,
          });
          continue;
        }

        const prev = existing.owners.get(owner.userId);
        if (!prev) {
          existing.owners.set(owner.userId, owner);
        } else if (owner.installed && !prev.installed) {
          existing.owners.set(owner.userId, owner);
        }

        existing.groupPlayable = mergeGroupPlayable(
          existing.groupPlayable,
          rowGroupPlayable,
        );

        if (launcherRank(row.launcher) < launcherRank(existing.launcher)) {
          existing.launcher = row.launcher;
          existing.externalId = row.external_id;
          existing.name = row.name;
        }
      }

      const myHidden = await db.pool.query<{
        launcher: string;
        external_id: string;
      }>(
        `
          SELECT launcher, external_id
          FROM group_hidden_games
          WHERE group_id = $1 AND user_id = $2
        `,
        [request.params.groupId, userId],
      );

      const libraryBase = [...byTitle.values()]
        .filter((game) => isVisibleInGroup(game.groupPlayable))
        .map((game) => {
          const owners = [...game.owners.values()];
          return {
            key: `${game.launcher}:${game.externalId}`,
            launcher: game.launcher,
            externalId: game.externalId,
            name: game.name,
            ownedCount: owners.length,
            installedCount: owners.filter((o) => o.installed).length,
            memberCount,
            owners,
            hiddenByMe: myHidden.rows.some(
              (h) =>
                h.launcher === game.launcher &&
                h.external_id === game.externalId,
            ),
          };
        })
        .sort((a, b) => {
          if (b.ownedCount !== a.ownedCount) return b.ownedCount - a.ownedCount;
          if (b.installedCount !== a.installedCount) {
            return b.installedCount - a.installedCount;
          }
          return a.name.localeCompare(b.name, "fr");
        });

      // Covers depuis game_meta (Epic catalog, Xbox TitleHub).
      const coverByKey = new Map<string, string>();
      if (libraryBase.length > 0) {
        const launchers = libraryBase.map((g) => g.launcher);
        const externalIds = libraryBase.map((g) => g.externalId);
        const covers = await db.pool.query<{
          launcher: string;
          external_id: string;
          cover_url: string | null;
        }>(
          `
            SELECT gm.launcher, gm.external_id, gm.cover_url
            FROM game_meta gm
            JOIN unnest($1::text[], $2::text[]) AS x(launcher, external_id)
              ON gm.launcher = x.launcher AND gm.external_id = x.external_id
            WHERE gm.cover_url IS NOT NULL
              AND (
                gm.source = 'igdb_manual'
                OR gm.cover_url NOT LIKE '%images.igdb.com%'
              )
          `,
          [launchers, externalIds],
        );
        for (const row of covers.rows) {
          if (row.cover_url) {
            coverByKey.set(`${row.launcher}:${row.external_id}`, row.cover_url);
          }
        }
      }

      const library = libraryBase.map((game) => ({
        ...game,
        coverUrl:
          coverByKey.get(game.key) ??
          riotCoverUrl(game.launcher, game.externalId) ??
          null,
      }));

      return {
        ok: true,
        memberCount,
        gameCount: library.length,
        games: library,
        myHiddenCount: myHidden.rows.length,
      };
    },
  );

  app.get<{ Params: { groupId: string } }>(
    "/groups/:groupId/library/hidden",
    async (request, reply) => {
      const userId = await requireUserId(db, request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }

      const membership = await getMembership(
        db,
        request.params.groupId,
        userId,
      );
      if (!membership) {
        return reply.code(404).send({ ok: false, error: "group_not_found" });
      }

      const result = await db.pool.query<{
        launcher: string;
        external_id: string;
        name: string | null;
        created_at: Date;
      }>(
        `
          SELECT h.launcher, h.external_id, ug.name, h.created_at
          FROM group_hidden_games h
          LEFT JOIN user_games ug
            ON ug.user_id = h.user_id
           AND ug.launcher = h.launcher
           AND ug.external_id = h.external_id
          WHERE h.group_id = $1 AND h.user_id = $2
          ORDER BY COALESCE(ug.name, h.external_id) ASC
        `,
        [request.params.groupId, userId],
      );

      return {
        ok: true,
        games: result.rows.map((row) => ({
          launcher: row.launcher,
          externalId: row.external_id,
          name: row.name ?? row.external_id,
          hiddenAt: row.created_at,
        })),
      };
    },
  );

  app.post<{ Params: { groupId: string } }>(
    "/groups/:groupId/library/hide",
    async (request, reply) => {
      const userId = await requireUserId(db, request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }

      const membership = await getMembership(
        db,
        request.params.groupId,
        userId,
      );
      if (!membership) {
        return reply.code(404).send({ ok: false, error: "group_not_found" });
      }

      const parsed = hideGameSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ ok: false, error: "invalid_body" });
      }

      const owns = await db.pool.query(
        `
          SELECT 1 FROM user_games
          WHERE user_id = $1 AND launcher = $2 AND external_id = $3
        `,
        [userId, parsed.data.launcher, parsed.data.externalId],
      );
      if (!owns.rowCount) {
        return reply.code(404).send({ ok: false, error: "game_not_in_library" });
      }

      await db.pool.query(
        `
          INSERT INTO group_hidden_games (group_id, user_id, launcher, external_id)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT DO NOTHING
        `,
        [
          request.params.groupId,
          userId,
          parsed.data.launcher,
          parsed.data.externalId,
        ],
      );

      return { ok: true };
    },
  );

  app.post<{ Params: { groupId: string } }>(
    "/groups/:groupId/library/unhide",
    async (request, reply) => {
      const userId = await requireUserId(db, request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }

      const membership = await getMembership(
        db,
        request.params.groupId,
        userId,
      );
      if (!membership) {
        return reply.code(404).send({ ok: false, error: "group_not_found" });
      }

      const parsed = hideGameSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ ok: false, error: "invalid_body" });
      }

      await db.pool.query(
        `
          DELETE FROM group_hidden_games
          WHERE group_id = $1 AND user_id = $2
            AND launcher = $3 AND external_id = $4
        `,
        [
          request.params.groupId,
          userId,
          parsed.data.launcher,
          parsed.data.externalId,
        ],
      );

      return { ok: true };
    },
  );
}
