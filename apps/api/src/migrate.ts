import type { Db } from "./db.js";

export async function migrate(db: Db): Promise<void> {
  await db.pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      discord_id TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL,
      global_name TEXT,
      avatar TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      revoked_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS auth_handoffs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code_hash TEXT NOT NULL UNIQUE,
      session_token TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS user_games (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      launcher TEXT NOT NULL,
      external_id TEXT NOT NULL,
      name TEXT NOT NULL,
      installed BOOLEAN NOT NULL DEFAULT false,
      owned BOOLEAN NOT NULL DEFAULT true,
      launchable BOOLEAN NOT NULL DEFAULT false,
      hidden BOOLEAN NOT NULL DEFAULT false,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, launcher, external_id)
    );

    CREATE INDEX IF NOT EXISTS user_games_user_id_idx ON user_games(user_id);
    CREATE INDEX IF NOT EXISTS user_games_launcher_idx ON user_games(launcher);

    CREATE TABLE IF NOT EXISTS library_sync_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      game_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS library_sync_runs_user_id_idx ON library_sync_runs(user_id);

    CREATE TABLE IF NOT EXISTS oauth_pending (
      state TEXT PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      client TEXT NOT NULL,
      code_verifier TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE oauth_pending
      ADD COLUMN IF NOT EXISTS code_verifier TEXT;

    CREATE INDEX IF NOT EXISTS oauth_pending_expires_at_idx ON oauth_pending(expires_at);

    CREATE TABLE IF NOT EXISTS microsoft_links (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      refresh_token_enc TEXT NOT NULL,
      access_token_enc TEXT,
      access_expires_at TIMESTAMPTZ,
      live_user_id TEXT,
      xuid TEXT NOT NULL,
      user_hash TEXT NOT NULL,
      xsts_token_enc TEXT,
      xsts_expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS epic_links (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      refresh_token_enc TEXT NOT NULL,
      access_token_enc TEXT,
      access_expires_at TIMESTAMPTZ,
      account_id TEXT NOT NULL,
      display_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}
