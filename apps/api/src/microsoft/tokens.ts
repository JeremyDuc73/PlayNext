import type { Env } from "../config.js";
import { decryptSecret, encryptSecret } from "../crypto/secret.js";
import type { Db } from "../db.js";
import {
  exchangeMicrosoftCode,
  refreshMicrosoftToken,
  type LiveTokenResponse,
} from "./oauth.js";
import { authenticateXboxLive, type XboxSession } from "./xbox.js";

export type StoredMicrosoftLink = {
  userId: string;
  liveUserId: string | null;
  xuid: string;
  userHash: string;
};

type LinkRow = {
  user_id: string;
  refresh_token_enc: string;
  access_token_enc: string | null;
  access_expires_at: Date | null;
  live_user_id: string | null;
  xuid: string;
  user_hash: string;
  xsts_token_enc: string | null;
  xsts_expires_at: Date | null;
};

function clientSecret(config: Env): string | undefined {
  return config.MICROSOFT_CLIENT_SECRET || undefined;
}

async function persistLiveAndXbox(
  db: Db,
  config: Env,
  userId: string,
  live: LiveTokenResponse,
  xbox: XboxSession,
): Promise<void> {
  const accessExpires = new Date(Date.now() + live.expires_in * 1000);
  await db.pool.query(
    `
      INSERT INTO microsoft_links (
        user_id, refresh_token_enc, access_token_enc, access_expires_at,
        live_user_id, xuid, user_hash, xsts_token_enc, xsts_expires_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
      ON CONFLICT (user_id) DO UPDATE SET
        refresh_token_enc = EXCLUDED.refresh_token_enc,
        access_token_enc = EXCLUDED.access_token_enc,
        access_expires_at = EXCLUDED.access_expires_at,
        live_user_id = EXCLUDED.live_user_id,
        xuid = EXCLUDED.xuid,
        user_hash = EXCLUDED.user_hash,
        xsts_token_enc = EXCLUDED.xsts_token_enc,
        xsts_expires_at = EXCLUDED.xsts_expires_at,
        updated_at = now()
    `,
    [
      userId,
      encryptSecret(live.refresh_token, config.SESSION_SECRET),
      encryptSecret(live.access_token, config.SESSION_SECRET),
      accessExpires,
      live.user_id ?? null,
      xbox.xuid,
      xbox.userHash,
      encryptSecret(xbox.xstsToken, config.SESSION_SECRET),
      xbox.expiresAt,
    ],
  );
}

export async function saveMicrosoftLinkFromCode(
  db: Db,
  config: Env,
  userId: string,
  code: string,
): Promise<void> {
  const live = await exchangeMicrosoftCode({
    clientId: config.MICROSOFT_CLIENT_ID,
    clientSecret: clientSecret(config),
    redirectUri: config.MICROSOFT_REDIRECT_URI,
    code,
  });
  const xbox = await authenticateXboxLive(live.access_token);
  await persistLiveAndXbox(db, config, userId, live, xbox);
}

export async function getMicrosoftLinkStatus(
  db: Db,
  userId: string,
): Promise<{ linked: boolean; xuid: string | null }> {
  const result = await db.pool.query<{ xuid: string }>(
    `SELECT xuid FROM microsoft_links WHERE user_id = $1`,
    [userId],
  );
  const row = result.rows[0];
  return { linked: Boolean(row), xuid: row?.xuid ?? null };
}

export async function deleteMicrosoftLink(
  db: Db,
  userId: string,
): Promise<void> {
  await db.pool.query(`DELETE FROM microsoft_links WHERE user_id = $1`, [
    userId,
  ]);
}

/** Returns a valid Xbox session, refreshing Live + XSTS tokens as needed. */
export async function getValidXboxSession(
  db: Db,
  config: Env,
  userId: string,
): Promise<XboxSession> {
  const result = await db.pool.query<LinkRow>(
    `
      SELECT user_id, refresh_token_enc, access_token_enc, access_expires_at,
             live_user_id, xuid, user_hash, xsts_token_enc, xsts_expires_at
      FROM microsoft_links
      WHERE user_id = $1
    `,
    [userId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("microsoft_not_linked");
  }

  const xstsFresh =
    row.xsts_token_enc &&
    row.xsts_expires_at &&
    row.xsts_expires_at.getTime() > Date.now() + 60_000;

  if (xstsFresh && row.xsts_token_enc) {
    return {
      xstsToken: decryptSecret(row.xsts_token_enc, config.SESSION_SECRET),
      userHash: row.user_hash,
      xuid: row.xuid,
      expiresAt: row.xsts_expires_at!,
    };
  }

  const refreshToken = decryptSecret(
    row.refresh_token_enc,
    config.SESSION_SECRET,
  );

  let liveAccess = row.access_token_enc
    ? decryptSecret(row.access_token_enc, config.SESSION_SECRET)
    : null;
  const accessFresh =
    row.access_expires_at &&
    row.access_expires_at.getTime() > Date.now() + 60_000;

  let live: LiveTokenResponse | null = null;
  if (!liveAccess || !accessFresh) {
    live = await refreshMicrosoftToken({
      clientId: config.MICROSOFT_CLIENT_ID,
      clientSecret: clientSecret(config),
      redirectUri: config.MICROSOFT_REDIRECT_URI,
      refreshToken,
    });
    liveAccess = live.access_token;
  }

  const xbox = await authenticateXboxLive(liveAccess!);
  if (live) {
    await persistLiveAndXbox(db, config, userId, live, xbox);
  } else {
    await db.pool.query(
      `
        UPDATE microsoft_links
        SET xuid = $2, user_hash = $3, xsts_token_enc = $4, xsts_expires_at = $5, updated_at = now()
        WHERE user_id = $1
      `,
      [
        userId,
        xbox.xuid,
        xbox.userHash,
        encryptSecret(xbox.xstsToken, config.SESSION_SECRET),
        xbox.expiresAt,
      ],
    );
  }

  return xbox;
}
