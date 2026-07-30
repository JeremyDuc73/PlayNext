import { createHash, randomBytes } from "node:crypto";
import type { Db } from "../db.js";

export const SESSION_COOKIE = "playnext_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export type PublicUser = {
  id: string;
  discordId: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
  avatarUrl: string | null;
  displayName: string;
};

export type SessionUserRow = {
  user_id: string;
  discord_id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function discordAvatarUrl(
  discordId: string,
  avatar: string | null,
): string | null {
  if (!avatar) return null;
  const ext = avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.${ext}?size=256`;
}

export function toPublicUser(row: SessionUserRow): PublicUser {
  return {
    id: row.user_id,
    discordId: row.discord_id,
    username: row.username,
    globalName: row.global_name,
    avatar: row.avatar,
    avatarUrl: discordAvatarUrl(row.discord_id, row.avatar),
    displayName: row.global_name || row.username,
  };
}

export async function upsertDiscordUser(
  db: Db,
  input: {
    discordId: string;
    username: string;
    globalName: string | null;
    avatar: string | null;
  },
): Promise<SessionUserRow> {
  const result = await db.pool.query<SessionUserRow>(
    `
      INSERT INTO users (discord_id, username, global_name, avatar)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (discord_id) DO UPDATE SET
        username = EXCLUDED.username,
        global_name = EXCLUDED.global_name,
        avatar = EXCLUDED.avatar,
        updated_at = now()
      RETURNING id AS user_id, discord_id, username, global_name, avatar
    `,
    [input.discordId, input.username, input.globalName, input.avatar],
  );

  return result.rows[0]!;
}

export async function createSession(
  db: Db,
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await db.pool.query(
    `
      INSERT INTO sessions (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
    `,
    [userId, tokenHash, expiresAt.toISOString()],
  );

  return { token, expiresAt };
}

export async function findUserBySessionToken(
  db: Db,
  token: string | undefined,
): Promise<PublicUser | null> {
  if (!token) return null;

  const result = await db.pool.query<SessionUserRow>(
    `
      SELECT
        u.id AS user_id,
        u.discord_id,
        u.username,
        u.global_name,
        u.avatar
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
      LIMIT 1
    `,
    [hashToken(token)],
  );

  const row = result.rows[0];
  return row ? toPublicUser(row) : null;
}

export async function revokeSession(
  db: Db,
  token: string | undefined,
): Promise<void> {
  if (!token) return;

  await db.pool.query(
    `
      UPDATE sessions
      SET revoked_at = now()
      WHERE token_hash = $1
        AND revoked_at IS NULL
    `,
    [hashToken(token)],
  );
}
