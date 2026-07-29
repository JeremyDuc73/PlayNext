import { createHash, randomBytes } from "node:crypto";
import type { Db } from "../db.js";

export const HANDOFF_TTL_SECONDS = 120;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** One-time code so the desktop app can receive a session without sharing browser cookies. */
export async function createHandoffCode(
  db: Db,
  sessionToken: string,
): Promise<string> {
  const code = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + HANDOFF_TTL_SECONDS * 1000);

  await db.pool.query(
    `
      INSERT INTO auth_handoffs (code_hash, session_token, expires_at)
      VALUES ($1, $2, $3)
    `,
    [hashCode(code), sessionToken, expiresAt.toISOString()],
  );

  return code;
}

export async function consumeHandoffCode(
  db: Db,
  code: string | undefined,
): Promise<string | null> {
  if (!code) return null;

  const result = await db.pool.query<{ session_token: string }>(
    `
      UPDATE auth_handoffs
      SET used_at = now()
      WHERE code_hash = $1
        AND used_at IS NULL
        AND expires_at > now()
      RETURNING session_token
    `,
    [hashCode(code)],
  );

  return result.rows[0]?.session_token ?? null;
}
