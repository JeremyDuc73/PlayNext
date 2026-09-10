import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { type GroupsRoutesOptions, requireUserId } from "./helpers.js";
import { getMembership } from "../../groups/membership.js";
import { isManager } from "../../groups/roles.js";
import { isDiscordBotConfigured } from "../../config.js";
import {
  DiscordBotError,
  discordBotInviteUrl,
  parseDiscordChannelId,
  resolveDiscordChannel,
} from "../../discord/bot.js";
import { notifyGroupDiscord } from "../../discord/notify.js";

const linkDiscordSchema = z.object({
  channelId: z.string().trim().min(1).max(128),
});

export function registerGroupDiscordRoutes(
  app: FastifyInstance,
  opts: GroupsRoutesOptions,
) {
  const { db, config } = opts;

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
      const userId = await requireUserId(db, request);
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
      const userId = await requireUserId(db, request);
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
        void notifyGroupDiscord(db, config, request.params.groupId, {
          kind: "linked",
          guildName: linked.guildName,
          channelName: linked.channelName,
        }).catch((err) => {
          request.log.warn({ err }, "discord_link_welcome_notify_failed");
        });
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
      const userId = await requireUserId(db, request);
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
}
