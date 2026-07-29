import type { Env } from "../config.js";
import { decryptSecret, encryptSecret } from "../crypto/secret.js";
import type { Db } from "../db.js";
import {
  exchangeEpicAuthCode,
  refreshEpicToken,
  type EpicTokenResponse,
} from "./oauth.js";

type LinkRow = {
  user_id: string;
  refresh_token_enc: string;
  access_token_enc: string | null;
  access_expires_at: Date | null;
  account_id: string;
  display_name: string | null;
};

async function persistTokens(
  db: Db,
  config: Env,
  userId: string,
  tokens: EpicTokenResponse,
): Promise<void> {
  const accessExpires = new Date(Date.now() + tokens.expires_in * 1000);
  await db.pool.query(
    `
      INSERT INTO epic_links (
        user_id, refresh_token_enc, access_token_enc, access_expires_at,
        account_id, display_name, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, now())
      ON CONFLICT (user_id) DO UPDATE SET
        refresh_token_enc = EXCLUDED.refresh_token_enc,
        access_token_enc = EXCLUDED.access_token_enc,
        access_expires_at = EXCLUDED.access_expires_at,
        account_id = EXCLUDED.account_id,
        display_name = EXCLUDED.display_name,
        updated_at = now()
    `,
    [
      userId,
      encryptSecret(tokens.refresh_token, config.SESSION_SECRET),
      encryptSecret(tokens.access_token, config.SESSION_SECRET),
      accessExpires,
      tokens.account_id,
      tokens.displayName ?? null,
    ],
  );
}

export async function saveEpicLinkFromCode(
  db: Db,
  config: Env,
  userId: string,
  code: string,
): Promise<void> {
  const tokens = await exchangeEpicAuthCode(code);
  await persistTokens(db, config, userId, tokens);
}

export async function getEpicLinkStatus(
  db: Db,
  userId: string,
): Promise<{ linked: boolean; accountId: string | null; displayName: string | null }> {
  const result = await db.pool.query<{
    account_id: string;
    display_name: string | null;
  }>(
    `SELECT account_id, display_name FROM epic_links WHERE user_id = $1`,
    [userId],
  );
  const row = result.rows[0];
  return {
    linked: Boolean(row),
    accountId: row?.account_id ?? null,
    displayName: row?.display_name ?? null,
  };
}

export async function deleteEpicLink(db: Db, userId: string): Promise<void> {
  await db.pool.query(`DELETE FROM epic_links WHERE user_id = $1`, [userId]);
}

export async function getValidEpicAccessToken(
  db: Db,
  config: Env,
  userId: string,
): Promise<{ accessToken: string; tokenType: string }> {
  const result = await db.pool.query<LinkRow>(
    `
      SELECT user_id, refresh_token_enc, access_token_enc, access_expires_at,
             account_id, display_name
      FROM epic_links
      WHERE user_id = $1
    `,
    [userId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("epic_not_linked");
  }

  const accessFresh =
    row.access_token_enc &&
    row.access_expires_at &&
    row.access_expires_at.getTime() > Date.now() + 60_000;

  if (accessFresh && row.access_token_enc) {
    return {
      accessToken: decryptSecret(row.access_token_enc, config.SESSION_SECRET),
      tokenType: "bearer",
    };
  }

  const refreshToken = decryptSecret(
    row.refresh_token_enc,
    config.SESSION_SECRET,
  );
  const tokens = await refreshEpicToken(refreshToken);
  await persistTokens(db, config, userId, tokens);
  return { accessToken: tokens.access_token, tokenType: tokens.token_type || "bearer" };
}
