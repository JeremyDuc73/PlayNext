import type { Env } from "../config.js";
import type { Db } from "../db.js";
import { postDiscordMessage } from "./bot.js";
import {
  formatDiscordNotice,
  type DiscordNotice,
} from "./messages.js";

export async function notifyGroupDiscord(
  db: Db,
  config: Env,
  groupId: string,
  notice: DiscordNotice,
): Promise<void> {
  if (!config.DISCORD_BOT_TOKEN) return;
  const result = await db.pool.query<{
    name: string;
    discord_channel_id: string | null;
  }>(
    `
      SELECT name, discord_channel_id
      FROM groups
      WHERE id = $1
    `,
    [groupId],
  );
  const group = result.rows[0];
  if (!group?.discord_channel_id) return;
  await postDiscordMessage(
    config.DISCORD_BOT_TOKEN,
    group.discord_channel_id,
    formatDiscordNotice(group.name, notice),
  );
}
