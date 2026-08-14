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

    CREATE TABLE IF NOT EXISTS user_hidden_games (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      launcher TEXT NOT NULL,
      external_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, launcher, external_id)
    );

    INSERT INTO user_hidden_games (user_id, launcher, external_id, name)
      SELECT user_id, launcher, external_id, name
      FROM user_games
      WHERE hidden = true
    ON CONFLICT (user_id, launcher, external_id) DO UPDATE
      SET name = EXCLUDED.name;

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

    CREATE TABLE IF NOT EXISTS groups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      image_url TEXT,
      owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT groups_name_len CHECK (char_length(name) BETWEEN 1 AND 64)
    );

    CREATE INDEX IF NOT EXISTS groups_owner_id_idx ON groups(owner_id);

    ALTER TABLE groups
      ADD COLUMN IF NOT EXISTS discord_guild_id TEXT;
    ALTER TABLE groups
      ADD COLUMN IF NOT EXISTS discord_guild_name TEXT;
    ALTER TABLE groups
      ADD COLUMN IF NOT EXISTS discord_channel_id TEXT;
    ALTER TABLE groups
      ADD COLUMN IF NOT EXISTS discord_channel_name TEXT;

    CREATE TABLE IF NOT EXISTS group_members (
      group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
      joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (group_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS group_members_user_id_idx ON group_members(user_id);

    CREATE TABLE IF NOT EXISTS group_invites (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      code TEXT NOT NULL UNIQUE,
      created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ,
      max_uses INTEGER CHECK (max_uses IS NULL OR max_uses > 0),
      use_count INTEGER NOT NULL DEFAULT 0,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS group_invites_group_id_idx ON group_invites(group_id);
    CREATE INDEX IF NOT EXISTS group_invites_code_idx ON group_invites(code);

    -- Games a member hides from a group without deleting them from their personal library.
    CREATE TABLE IF NOT EXISTS group_hidden_games (
      group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      launcher TEXT NOT NULL,
      external_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (group_id, user_id, launcher, external_id)
    );

    CREATE INDEX IF NOT EXISTS group_hidden_games_user_idx
      ON group_hidden_games(user_id, group_id);

    CREATE TABLE IF NOT EXISTS evenings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (
        status IN ('lobby', 'selection', 'voting', 'revealed', 'closed', 'cancelled')
      ),
      title TEXT,
      duration_minutes INTEGER
        CHECK (duration_minutes IS NULL OR (duration_minutes BETWEEN 15 AND 600)),
      vibe TEXT CHECK (
        vibe IS NULL OR vibe IN ('chill', 'competitive', 'campaign', 'party', 'any')
      ),
      require_owned BOOLEAN NOT NULL DEFAULT false,
      require_installed BOOLEAN NOT NULL DEFAULT false,
      shortlist_size INTEGER NOT NULL DEFAULT 3
        CHECK (shortlist_size BETWEEN 1 AND 5),
      round INTEGER NOT NULL DEFAULT 1,
      vote_cursor INTEGER NOT NULL DEFAULT 0,
      closes_at TIMESTAMPTZ,
      revealed_at TIMESTAMPTZ,
      closed_at TIMESTAMPTZ,
      winner_candidate_id UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS evenings_group_id_idx ON evenings(group_id);
    CREATE INDEX IF NOT EXISTS evenings_status_idx ON evenings(status);

    ALTER TABLE evenings
      DROP CONSTRAINT IF EXISTS evenings_shortlist_size_check;
    ALTER TABLE evenings
      DROP CONSTRAINT IF EXISTS evenings_status_check;
    UPDATE evenings
    SET shortlist_size = LEAST(5, GREATEST(1, shortlist_size));
    ALTER TABLE evenings
      ALTER COLUMN shortlist_size SET DEFAULT 3;
    ALTER TABLE evenings
      ALTER COLUMN require_owned SET DEFAULT false;
    ALTER TABLE evenings
      ADD CONSTRAINT evenings_shortlist_size_check
      CHECK (shortlist_size BETWEEN 1 AND 5);
    ALTER TABLE evenings
      ADD CONSTRAINT evenings_status_check
      CHECK (status IN ('lobby', 'selection', 'voting', 'revealed', 'closed', 'cancelled'));
    ALTER TABLE evenings
      ADD COLUMN IF NOT EXISTS vote_cursor INTEGER NOT NULL DEFAULT 0;

    CREATE TABLE IF NOT EXISTS evening_participants (
      evening_id UUID NOT NULL REFERENCES evenings(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      present BOOLEAN NOT NULL DEFAULT true,
      veto_available BOOLEAN NOT NULL DEFAULT true,
      selection_submitted BOOLEAN NOT NULL DEFAULT false,
      ready_at TIMESTAMPTZ,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (evening_id, user_id)
    );

    ALTER TABLE evening_participants
      ADD COLUMN IF NOT EXISTS selection_submitted BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE evening_participants
      ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ;

    UPDATE evenings
    SET status = 'selection'
    WHERE status = 'voting'
      AND NOT EXISTS (
        SELECT 1
        FROM evening_participants p
        WHERE p.evening_id = evenings.id
          AND p.selection_submitted = true
      );

    CREATE INDEX IF NOT EXISTS evening_participants_user_id_idx
      ON evening_participants(user_id);

    CREATE TABLE IF NOT EXISTS evening_candidates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      evening_id UUID NOT NULL REFERENCES evenings(id) ON DELETE CASCADE,
      round INTEGER NOT NULL DEFAULT 1,
      launcher TEXT NOT NULL,
      external_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      owned_count INTEGER NOT NULL DEFAULT 0,
      installed_count INTEGER NOT NULL DEFAULT 0,
      participant_count INTEGER NOT NULL DEFAULT 0,
      reasons TEXT[] NOT NULL DEFAULT '{}',
      eliminated BOOLEAN NOT NULL DEFAULT false,
      eliminated_reason TEXT,
      UNIQUE (evening_id, round, launcher, external_id)
    );

    CREATE INDEX IF NOT EXISTS evening_candidates_evening_idx
      ON evening_candidates(evening_id, round);

    CREATE TABLE IF NOT EXISTS evening_selections (
      evening_id UUID NOT NULL REFERENCES evenings(id) ON DELETE CASCADE,
      candidate_id UUID NOT NULL REFERENCES evening_candidates(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      round INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (candidate_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS evening_selections_evening_user_idx
      ON evening_selections(evening_id, user_id, round);

    DO $$ BEGIN
      ALTER TABLE evenings
        ADD CONSTRAINT evenings_winner_candidate_fk
        FOREIGN KEY (winner_candidate_id)
        REFERENCES evening_candidates(id)
        ON DELETE SET NULL;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;

    CREATE TABLE IF NOT EXISTS evening_votes (
      evening_id UUID NOT NULL REFERENCES evenings(id) ON DELETE CASCADE,
      candidate_id UUID NOT NULL REFERENCES evening_candidates(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      value TEXT NOT NULL CHECK (value IN ('hot', 'maybe', 'pass', 'veto')),
      round INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (candidate_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS evening_votes_evening_user_idx
      ON evening_votes(evening_id, user_id);

    CREATE TABLE IF NOT EXISTS game_meta (
      launcher TEXT NOT NULL,
      external_id TEXT NOT NULL,
      name TEXT NOT NULL,
      igdb_id INTEGER,
      cover_image_id TEXT,
      cover_url TEXT,
      year INTEGER,
      genres TEXT[] NOT NULL DEFAULT '{}',
      source TEXT NOT NULL DEFAULT 'unknown',
      group_playable BOOLEAN,
      group_playable_source TEXT,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (launcher, external_id)
    );

    ALTER TABLE game_meta
      ADD COLUMN IF NOT EXISTS group_playable BOOLEAN;
    ALTER TABLE game_meta
      ADD COLUMN IF NOT EXISTS group_playable_source TEXT;

    -- Ancien enrichissement : un 429 Store était gravé comme « inconnu ».
    -- Sans source, le classement peut reprendre (lents, un titre à la fois).
    UPDATE game_meta
    SET group_playable_source = NULL
    WHERE group_playable IS NULL
      AND group_playable_source = 'steam_store_search';

    -- Nettoyage de l’ancien pipeline IGDB abandonné.
    UPDATE game_meta
    SET cover_url = NULL,
        cover_image_id = NULL,
        igdb_id = NULL,
        year = NULL,
        genres = '{}',
        source = CASE
          WHEN launcher = 'steam' THEN 'steam_cdn'
          ELSE 'none'
        END,
        fetched_at = now()
    WHERE source = 'igdb'
       OR (
         cover_url LIKE '%images.igdb.com%'
         AND source <> 'igdb_manual'
       );

    CREATE INDEX IF NOT EXISTS game_meta_igdb_id_idx ON game_meta(igdb_id);
  `);
}
