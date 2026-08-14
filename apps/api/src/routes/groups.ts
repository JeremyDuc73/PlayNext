import { randomBytes } from "node:crypto";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { getSessionToken } from "../auth/request-session.js";
import { findUserBySessionToken, toPublicUser } from "../auth/session.js";
import type { Env } from "../config.js";
import { isDiscordBotConfigured } from "../config.js";
import type { Db } from "../db.js";
import {
  DiscordBotError,
  discordBotInviteUrl,
  parseDiscordChannelId,
  resolveDiscordChannel,
} from "../discord/bot.js";
import { getMembership } from "../groups/membership.js";
import {
  canManageMember,
  isManager,
  type GroupRole,
} from "../groups/roles.js";
import {
  isJunkGameName,
  isVisibleInGroup,
  launcherRank,
  mergeGroupPlayable,
  normalizeGameTitle,
  resolveGroupPlayable,
} from "../library/filter.js";
import { riotCoverUrl } from "../meta/covers.js";
import { persistMissingGroupPlayable, loadGroupPlayableByTitle } from "../steam/store.js";

type GroupsRoutesOptions = {
  db: Db;
  config: Env;
};

const imageUrlSchema = z
  .union([z.string().url().max(512), z.literal(""), z.null()])
  .optional();

const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(64),
  imageUrl: imageUrlSchema,
});

const patchGroupSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  imageUrl: imageUrlSchema,
});

const createInviteSchema = z.object({
  expiresInDays: z.number().int().min(1).max(90).optional(),
  maxUses: z.number().int().min(1).max(1000).optional().nullable(),
});

const setRoleSchema = z.object({
  role: z.enum(["admin", "member"]),
});

const transferSchema = z.object({
  userId: z.string().uuid(),
});

const hideGameSchema = z.object({
  launcher: z.string().min(1).max(32),
  externalId: z.string().min(1).max(256),
});

function newInviteCode(): string {
  return randomBytes(9).toString("base64url");
}

function inviteDeepLink(code: string): string {
  return `playnext://invite/${code}`;
}

function normalizeImageUrl(value: string | null | undefined): string | null {
  if (value === null || value === "" || value === undefined) return null;
  return value;
}

export const groupsRoutes: FastifyPluginAsync<GroupsRoutesOptions> = async (
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

  async function loadGroupSummary(groupId: string) {
    const result = await db.pool.query<{
      id: string;
      name: string;
      image_url: string | null;
      owner_id: string;
      created_at: Date;
      updated_at: Date;
      member_count: string;
    }>(
      `
        SELECT g.id, g.name, g.image_url, g.owner_id, g.created_at, g.updated_at,
               COUNT(m.user_id)::text AS member_count
        FROM groups g
        JOIN group_members m ON m.group_id = g.id
        WHERE g.id = $1
        GROUP BY g.id
      `,
      [groupId],
    );
    return result.rows[0] ?? null;
  }

  function mapGroup(
    row: {
      id: string;
      name: string;
      image_url: string | null;
      owner_id: string;
      created_at: Date;
      updated_at: Date;
      member_count?: string;
    },
    myRole?: GroupRole,
  ) {
    return {
      id: row.id,
      name: row.name,
      imageUrl: row.image_url,
      ownerId: row.owner_id,
      memberCount: row.member_count ? Number(row.member_count) : undefined,
      myRole,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  app.get("/groups", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) {
      return reply.code(401).send({ ok: false, error: "unauthenticated" });
    }

    const result = await db.pool.query<{
      id: string;
      name: string;
      image_url: string | null;
      owner_id: string;
      created_at: Date;
      updated_at: Date;
      my_role: GroupRole;
      member_count: string;
    }>(
      `
        SELECT g.id, g.name, g.image_url, g.owner_id, g.created_at, g.updated_at,
               mine.role AS my_role,
               COUNT(all_m.user_id)::text AS member_count
        FROM group_members mine
        JOIN groups g ON g.id = mine.group_id
        JOIN group_members all_m ON all_m.group_id = g.id
        WHERE mine.user_id = $1
        GROUP BY g.id, mine.role
        ORDER BY g.name ASC
      `,
      [userId],
    );

    return {
      ok: true,
      groups: result.rows.map((row) => mapGroup(row, row.my_role)),
    };
  });

  app.post("/groups", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) {
      return reply.code(401).send({ ok: false, error: "unauthenticated" });
    }

    const parsed = createGroupSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: "invalid_body",
        details: parsed.error.flatten(),
      });
    }

    const imageUrl = normalizeImageUrl(parsed.data.imageUrl ?? null);
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      const group = await client.query<{
        id: string;
        name: string;
        image_url: string | null;
        owner_id: string;
        created_at: Date;
        updated_at: Date;
      }>(
        `
          INSERT INTO groups (name, image_url, owner_id)
          VALUES ($1, $2, $3)
          RETURNING id, name, image_url, owner_id, created_at, updated_at
        `,
        [parsed.data.name, imageUrl, userId],
      );
      const row = group.rows[0]!;
      await client.query(
        `
          INSERT INTO group_members (group_id, user_id, role)
          VALUES ($1, $2, 'owner')
        `,
        [row.id, userId],
      );
      await client.query("COMMIT");
      return reply.code(201).send({
        ok: true,
        group: { ...mapGroup(row, "owner"), memberCount: 1 },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  app.get<{ Params: { groupId: string } }>(
    "/groups/:groupId",
    async (request, reply) => {
      const userId = await requireUserId(request);
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

      const summary = await loadGroupSummary(request.params.groupId);
      if (!summary) {
        return reply.code(404).send({ ok: false, error: "group_not_found" });
      }

      const members = await db.pool.query<{
        user_id: string;
        role: GroupRole;
        joined_at: Date;
        discord_id: string;
        username: string;
        global_name: string | null;
        avatar: string | null;
      }>(
        `
          SELECT m.user_id, m.role, m.joined_at,
                 u.discord_id, u.username, u.global_name, u.avatar
          FROM group_members m
          JOIN users u ON u.id = m.user_id
          WHERE m.group_id = $1
          ORDER BY
            CASE m.role
              WHEN 'owner' THEN 0
              WHEN 'admin' THEN 1
              ELSE 2
            END,
            COALESCE(u.global_name, u.username) ASC
        `,
        [request.params.groupId],
      );

      return {
        ok: true,
        group: mapGroup(summary, membership.role),
        members: members.rows.map((row) => ({
          ...toPublicUser({
            user_id: row.user_id,
            discord_id: row.discord_id,
            username: row.username,
            global_name: row.global_name,
            avatar: row.avatar,
          }),
          role: row.role,
          joinedAt: row.joined_at,
        })),
      };
    },
  );

  app.patch<{ Params: { groupId: string } }>(
    "/groups/:groupId",
    async (request, reply) => {
      const userId = await requireUserId(request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }

      const membership = await getMembership(
        db,
        request.params.groupId,
        userId,
      );
      if (!membership || !isManager(membership.role)) {
        return reply.code(403).send({ ok: false, error: "forbidden" });
      }

      const parsed = patchGroupSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          ok: false,
          error: "invalid_body",
          details: parsed.error.flatten(),
        });
      }
      if (
        parsed.data.name === undefined &&
        parsed.data.imageUrl === undefined
      ) {
        return reply.code(400).send({ ok: false, error: "nothing_to_update" });
      }

      const current = await loadGroupSummary(request.params.groupId);
      if (!current) {
        return reply.code(404).send({ ok: false, error: "group_not_found" });
      }

      const nextName = parsed.data.name ?? current.name;
      const nextImage =
        parsed.data.imageUrl === undefined
          ? current.image_url
          : normalizeImageUrl(parsed.data.imageUrl);

      const updated = await db.pool.query<{
        id: string;
        name: string;
        image_url: string | null;
        owner_id: string;
        created_at: Date;
        updated_at: Date;
      }>(
        `
          UPDATE groups
          SET name = $2, image_url = $3, updated_at = now()
          WHERE id = $1
          RETURNING id, name, image_url, owner_id, created_at, updated_at
        `,
        [request.params.groupId, nextName, nextImage],
      );

      return {
        ok: true,
        group: mapGroup(
          {
            ...updated.rows[0]!,
            member_count: current.member_count,
          },
          membership.role,
        ),
      };
    },
  );

  const linkDiscordSchema = z.object({
    channelId: z.string().trim().min(1).max(128),
  });

  function discordStatus(row: {
    discord_guild_id: string | null;
    discord_guild_name: string | null;
    discord_channel_id: string | null;
    discord_channel_name: string | null;
  }) {
    const configured = isDiscordBotConfigured(config);
    return {
      configured,
      inviteUrl:
        configured && config.DISCORD_CLIENT_ID
          ? discordBotInviteUrl(config.DISCORD_CLIENT_ID)
          : null,
      linked: Boolean(row.discord_channel_id),
      guildId: row.discord_guild_id,
      guildName: row.discord_guild_name,
      channelId: row.discord_channel_id,
      channelName: row.discord_channel_name,
    };
  }

  app.get<{ Params: { groupId: string } }>(
    "/groups/:groupId/discord",
    async (request, reply) => {
      const userId = await requireUserId(request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }
      const membership = await getMembership(
        db,
        request.params.groupId,
        userId,
      );
      if (!membership || !isManager(membership.role)) {
        return reply.code(403).send({ ok: false, error: "forbidden" });
      }

      const result = await db.pool.query<{
        discord_guild_id: string | null;
        discord_guild_name: string | null;
        discord_channel_id: string | null;
        discord_channel_name: string | null;
      }>(
        `
          SELECT discord_guild_id, discord_guild_name,
                 discord_channel_id, discord_channel_name
          FROM groups
          WHERE id = $1
        `,
        [request.params.groupId],
      );
      const row = result.rows[0];
      if (!row) {
        return reply.code(404).send({ ok: false, error: "group_not_found" });
      }
      return { ok: true, discord: discordStatus(row) };
    },
  );

  app.put<{ Params: { groupId: string } }>(
    "/groups/:groupId/discord",
    async (request, reply) => {
      const userId = await requireUserId(request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }
      const membership = await getMembership(
        db,
        request.params.groupId,
        userId,
      );
      if (!membership || !isManager(membership.role)) {
        return reply.code(403).send({ ok: false, error: "forbidden" });
      }
      if (!isDiscordBotConfigured(config)) {
        return reply.code(400).send({
          ok: false,
          error: "bot_not_configured",
          message: "Bot Discord non configuré.",
        });
      }

      const parsed = linkDiscordSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ ok: false, error: "invalid_body" });
      }
      const channelId = parseDiscordChannelId(parsed.data.channelId);
      if (!channelId) {
        return reply.code(400).send({
          ok: false,
          error: "invalid_channel",
          message: "Identifiant de salon invalide.",
        });
      }

      try {
        const linked = await resolveDiscordChannel(
          config.DISCORD_BOT_TOKEN,
          channelId,
        );
        await db.pool.query(
          `
            UPDATE groups
            SET discord_guild_id = $2,
                discord_guild_name = $3,
                discord_channel_id = $4,
                discord_channel_name = $5,
                updated_at = now()
            WHERE id = $1
          `,
          [
            request.params.groupId,
            linked.guildId,
            linked.guildName,
            linked.channelId,
            linked.channelName,
          ],
        );
        return {
          ok: true,
          discord: discordStatus({
            discord_guild_id: linked.guildId,
            discord_guild_name: linked.guildName,
            discord_channel_id: linked.channelId,
            discord_channel_name: linked.channelName,
          }),
        };
      } catch (error) {
        if (error instanceof DiscordBotError) {
          const message =
            error.code === "forbidden"
              ? "Le bot n’a pas accès à ce salon. Invite-le d’abord."
              : error.code === "not_found"
                ? "Salon introuvable."
                : "Liaison Discord impossible.";
          return reply.code(400).send({
            ok: false,
            error: `discord_${error.code}`,
            message,
          });
        }
        throw error;
      }
    },
  );

  app.delete<{ Params: { groupId: string } }>(
    "/groups/:groupId/discord",
    async (request, reply) => {
      const userId = await requireUserId(request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }
      const membership = await getMembership(
        db,
        request.params.groupId,
        userId,
      );
      if (!membership || !isManager(membership.role)) {
        return reply.code(403).send({ ok: false, error: "forbidden" });
      }

      await db.pool.query(
        `
          UPDATE groups
          SET discord_guild_id = NULL,
              discord_guild_name = NULL,
              discord_channel_id = NULL,
              discord_channel_name = NULL,
              updated_at = now()
          WHERE id = $1
        `,
        [request.params.groupId],
      );
      return {
        ok: true,
        discord: discordStatus({
          discord_guild_id: null,
          discord_guild_name: null,
          discord_channel_id: null,
          discord_channel_name: null,
        }),
      };
    },
  );

  app.delete<{ Params: { groupId: string } }>(
    "/groups/:groupId",
    async (request, reply) => {
      const userId = await requireUserId(request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }

      const membership = await getMembership(
        db,
        request.params.groupId,
        userId,
      );
      if (!membership || membership.role !== "owner") {
        return reply.code(403).send({ ok: false, error: "forbidden" });
      }

      await db.pool.query(`DELETE FROM groups WHERE id = $1`, [
        request.params.groupId,
      ]);
      return { ok: true };
    },
  );

  app.post<{ Params: { groupId: string } }>(
    "/groups/:groupId/leave",
    async (request, reply) => {
      const userId = await requireUserId(request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }

      const membership = await getMembership(
        db,
        request.params.groupId,
        userId,
      );
      if (!membership) {
        return reply.code(404).send({ ok: false, error: "not_a_member" });
      }
      if (membership.role === "owner") {
        return reply.code(400).send({
          ok: false,
          error: "owner_must_transfer",
          message:
            "Transfère la propriété avant de quitter, ou supprime le groupe.",
        });
      }

      await db.pool.query(
        `DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`,
        [request.params.groupId, userId],
      );
      await db.pool.query(
        `DELETE FROM group_hidden_games WHERE group_id = $1 AND user_id = $2`,
        [request.params.groupId, userId],
      );
      return { ok: true };
    },
  );

  app.post<{ Params: { groupId: string } }>(
    "/groups/:groupId/transfer",
    async (request, reply) => {
      const userId = await requireUserId(request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }

      const membership = await getMembership(
        db,
        request.params.groupId,
        userId,
      );
      if (!membership || membership.role !== "owner") {
        return reply.code(403).send({ ok: false, error: "forbidden" });
      }

      const parsed = transferSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ ok: false, error: "invalid_body" });
      }
      if (parsed.data.userId === userId) {
        return reply.code(400).send({ ok: false, error: "already_owner" });
      }

      const target = await getMembership(
        db,
        request.params.groupId,
        parsed.data.userId,
      );
      if (!target) {
        return reply.code(404).send({ ok: false, error: "member_not_found" });
      }

      const client = await db.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `UPDATE groups SET owner_id = $2, updated_at = now() WHERE id = $1`,
          [request.params.groupId, parsed.data.userId],
        );
        await client.query(
          `UPDATE group_members SET role = 'member' WHERE group_id = $1 AND user_id = $2`,
          [request.params.groupId, userId],
        );
        await client.query(
          `UPDATE group_members SET role = 'owner' WHERE group_id = $1 AND user_id = $2`,
          [request.params.groupId, parsed.data.userId],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      return { ok: true };
    },
  );

  app.patch<{ Params: { groupId: string; memberId: string } }>(
    "/groups/:groupId/members/:memberId",
    async (request, reply) => {
      const userId = await requireUserId(request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }

      const actor = await getMembership(db, request.params.groupId, userId);
      if (!actor || !isManager(actor.role)) {
        return reply.code(403).send({ ok: false, error: "forbidden" });
      }

      const parsed = setRoleSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ ok: false, error: "invalid_body" });
      }

      const target = await getMembership(
        db,
        request.params.groupId,
        request.params.memberId,
      );
      if (!target) {
        return reply.code(404).send({ ok: false, error: "member_not_found" });
      }
      if (!canManageMember(actor.role, target.role)) {
        return reply.code(403).send({ ok: false, error: "forbidden" });
      }
      if (parsed.data.role === "admin" && actor.role !== "owner") {
        return reply.code(403).send({ ok: false, error: "owner_only_promote" });
      }

      await db.pool.query(
        `
          UPDATE group_members
          SET role = $3
          WHERE group_id = $1 AND user_id = $2
        `,
        [request.params.groupId, request.params.memberId, parsed.data.role],
      );

      return { ok: true, role: parsed.data.role };
    },
  );

  app.delete<{ Params: { groupId: string; memberId: string } }>(
    "/groups/:groupId/members/:memberId",
    async (request, reply) => {
      const userId = await requireUserId(request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }

      const actor = await getMembership(db, request.params.groupId, userId);
      if (!actor || !isManager(actor.role)) {
        return reply.code(403).send({ ok: false, error: "forbidden" });
      }

      const target = await getMembership(
        db,
        request.params.groupId,
        request.params.memberId,
      );
      if (!target) {
        return reply.code(404).send({ ok: false, error: "member_not_found" });
      }
      if (!canManageMember(actor.role, target.role)) {
        return reply.code(403).send({ ok: false, error: "forbidden" });
      }

      await db.pool.query(
        `DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`,
        [request.params.groupId, request.params.memberId],
      );
      await db.pool.query(
        `DELETE FROM group_hidden_games WHERE group_id = $1 AND user_id = $2`,
        [request.params.groupId, request.params.memberId],
      );

      return { ok: true };
    },
  );

  app.post<{ Params: { groupId: string } }>(
    "/groups/:groupId/invites",
    async (request, reply) => {
      const userId = await requireUserId(request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }

      const membership = await getMembership(
        db,
        request.params.groupId,
        userId,
      );
      if (!membership || !isManager(membership.role)) {
        return reply.code(403).send({ ok: false, error: "forbidden" });
      }

      const parsed = createInviteSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ ok: false, error: "invalid_body" });
      }

      const code = newInviteCode();
      const expiresAt = parsed.data.expiresInDays
        ? new Date(
            Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000,
          )
        : null;

      const inserted = await db.pool.query<{
        id: string;
        code: string;
        expires_at: Date | null;
        max_uses: number | null;
        use_count: number;
        created_at: Date;
      }>(
        `
          INSERT INTO group_invites (
            group_id, code, created_by, expires_at, max_uses
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, code, expires_at, max_uses, use_count, created_at
        `,
        [
          request.params.groupId,
          code,
          userId,
          expiresAt,
          parsed.data.maxUses ?? null,
        ],
      );
      const row = inserted.rows[0]!;

      return reply.code(201).send({
        ok: true,
        invite: {
          id: row.id,
          code: row.code,
          deepLink: inviteDeepLink(row.code),
          expiresAt: row.expires_at,
          maxUses: row.max_uses,
          useCount: row.use_count,
          createdAt: row.created_at,
        },
      });
    },
  );

  app.get<{ Params: { groupId: string } }>(
    "/groups/:groupId/invites",
    async (request, reply) => {
      const userId = await requireUserId(request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }

      const membership = await getMembership(
        db,
        request.params.groupId,
        userId,
      );
      if (!membership || !isManager(membership.role)) {
        return reply.code(403).send({ ok: false, error: "forbidden" });
      }

      const result = await db.pool.query<{
        id: string;
        code: string;
        expires_at: Date | null;
        max_uses: number | null;
        use_count: number;
        revoked_at: Date | null;
        created_at: Date;
      }>(
        `
          SELECT id, code, expires_at, max_uses, use_count, revoked_at, created_at
          FROM group_invites
          WHERE group_id = $1
          ORDER BY created_at DESC
          LIMIT 50
        `,
        [request.params.groupId],
      );

      return {
        ok: true,
        invites: result.rows.map((row) => ({
          id: row.id,
          code: row.code,
          deepLink: inviteDeepLink(row.code),
          expiresAt: row.expires_at,
          maxUses: row.max_uses,
          useCount: row.use_count,
          revokedAt: row.revoked_at,
          active:
            !row.revoked_at &&
            (!row.expires_at || row.expires_at > new Date()) &&
            (row.max_uses == null || row.use_count < row.max_uses),
          createdAt: row.created_at,
        })),
      };
    },
  );

  app.delete<{ Params: { groupId: string; inviteId: string } }>(
    "/groups/:groupId/invites/:inviteId",
    async (request, reply) => {
      const userId = await requireUserId(request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }

      const membership = await getMembership(
        db,
        request.params.groupId,
        userId,
      );
      if (!membership || !isManager(membership.role)) {
        return reply.code(403).send({ ok: false, error: "forbidden" });
      }

      const updated = await db.pool.query(
        `
          UPDATE group_invites
          SET revoked_at = now()
          WHERE id = $1 AND group_id = $2 AND revoked_at IS NULL
        `,
        [request.params.inviteId, request.params.groupId],
      );
      if (updated.rowCount === 0) {
        return reply.code(404).send({ ok: false, error: "invite_not_found" });
      }
      return { ok: true };
    },
  );

  app.get<{ Params: { code: string } }>(
    "/invites/:code",
    async (request, reply) => {
      const userId = await requireUserId(request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }

      const invite = await db.pool.query<{
        id: string;
        group_id: string;
        code: string;
        expires_at: Date | null;
        max_uses: number | null;
        use_count: number;
        revoked_at: Date | null;
        name: string;
        image_url: string | null;
        member_count: string;
      }>(
        `
          SELECT i.id, i.group_id, i.code, i.expires_at, i.max_uses, i.use_count,
                 i.revoked_at, g.name, g.image_url,
                 COUNT(m.user_id)::text AS member_count
          FROM group_invites i
          JOIN groups g ON g.id = i.group_id
          JOIN group_members m ON m.group_id = g.id
          WHERE i.code = $1
          GROUP BY i.id, g.id
        `,
        [request.params.code],
      );
      const row = invite.rows[0];
      if (!row) {
        return reply.code(404).send({ ok: false, error: "invite_not_found" });
      }

      const membership = await getMembership(db, row.group_id, userId);
      const expired = Boolean(row.expires_at && row.expires_at <= new Date());
      const exhausted =
        row.max_uses != null && row.use_count >= row.max_uses;
      const revoked = Boolean(row.revoked_at);
      const joinable = !revoked && !expired && !exhausted && !membership;

      return {
        ok: true,
        invite: {
          code: row.code,
          deepLink: inviteDeepLink(row.code),
          group: {
            id: row.group_id,
            name: row.name,
            imageUrl: row.image_url,
            memberCount: Number(row.member_count),
          },
          alreadyMember: Boolean(membership),
          joinable,
          reason: revoked
            ? "revoked"
            : expired
              ? "expired"
              : exhausted
                ? "exhausted"
                : membership
                  ? "already_member"
                  : null,
        },
      };
    },
  );

  app.post<{ Params: { code: string } }>(
    "/invites/:code/join",
    async (request, reply) => {
      const userId = await requireUserId(request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }

      const client = await db.pool.connect();
      try {
        await client.query("BEGIN");
        const invite = await client.query<{
          id: string;
          group_id: string;
          expires_at: Date | null;
          max_uses: number | null;
          use_count: number;
          revoked_at: Date | null;
        }>(
          `
            SELECT id, group_id, expires_at, max_uses, use_count, revoked_at
            FROM group_invites
            WHERE code = $1
            FOR UPDATE
          `,
          [request.params.code],
        );
        const row = invite.rows[0];
        if (!row) {
          await client.query("ROLLBACK");
          return reply
            .code(404)
            .send({ ok: false, error: "invite_not_found" });
        }
        if (row.revoked_at) {
          await client.query("ROLLBACK");
          return reply.code(410).send({ ok: false, error: "invite_revoked" });
        }
        if (row.expires_at && row.expires_at <= new Date()) {
          await client.query("ROLLBACK");
          return reply.code(410).send({ ok: false, error: "invite_expired" });
        }
        if (row.max_uses != null && row.use_count >= row.max_uses) {
          await client.query("ROLLBACK");
          return reply
            .code(410)
            .send({ ok: false, error: "invite_exhausted" });
        }

        const existing = await client.query(
          `SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2`,
          [row.group_id, userId],
        );
        if (existing.rowCount && existing.rowCount > 0) {
          await client.query("COMMIT");
          return {
            ok: true,
            alreadyMember: true,
            groupId: row.group_id,
          };
        }

        await client.query(
          `
            INSERT INTO group_members (group_id, user_id, role)
            VALUES ($1, $2, 'member')
          `,
          [row.group_id, userId],
        );
        await client.query(
          `
            UPDATE group_invites
            SET use_count = use_count + 1
            WHERE id = $1
          `,
          [row.id],
        );
        await client.query("COMMIT");
        return { ok: true, alreadyMember: false, groupId: row.group_id };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  );

  app.get<{ Params: { groupId: string } }>(
    "/groups/:groupId/library",
    async (request, reply) => {
      const userId = await requireUserId(request);
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
      const userId = await requireUserId(request);
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
      const userId = await requireUserId(request);
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
      const userId = await requireUserId(request);
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
};
