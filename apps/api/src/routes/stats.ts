import type { FastifyPluginAsync } from "fastify";
import type { Db } from "../db.js";
import { discordAvatarUrl } from "../auth/session.js";

export const EXCLUDED_DISCORD_IDS = ["230720809218342912"];
export const EXCLUDED_USERNAMES = ["nashoba_"];
export const ADMIN_ACCESS_CODE = "fidjie";

export function isValidAdminCode(candidate?: string | null): boolean {
  if (!candidate) return false;
  return candidate.trim().toLowerCase() === ADMIN_ACCESS_CODE.toLowerCase();
}

export function isExcludedUser(user: {
  discordId?: string | null;
  username?: string | null;
  globalName?: string | null;
}): boolean {
  if (user.discordId && EXCLUDED_DISCORD_IDS.includes(user.discordId)) {
    return true;
  }
  const username = user.username?.trim().toLowerCase();
  if (username && EXCLUDED_USERNAMES.includes(username)) {
    return true;
  }
  const globalName = user.globalName?.trim().toLowerCase();
  if (globalName && EXCLUDED_USERNAMES.includes(globalName)) {
    return true;
  }
  return false;
}

export type ActiveUserItem = {
  id: string;
  discordId: string;
  username: string;
  globalName: string | null;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
  lastActiveAt: string;
  isOnline: boolean;
  gamesCount: number;
  groupsCount: number;
};

export type DayActivity = {
  date: string;
  label: string;
  activeCount: number;
};

export type StatsResponse = {
  ok: true;
  generatedAt: string;
  excludedFiltered: {
    discordIds: string[];
    usernames: string[];
  };
  activeUsers: {
    now: number;
    last24h: number;
    last7d: number;
    last30d: number;
    total: number;
  };
  overview: {
    totalGroups: number;
    totalEvenings: number;
    completedEvenings: number;
    liveEvenings: number;
    totalVotes: number;
    totalUserGames: number;
    uniqueGames: number;
    totalProposals: number;
  };
  timeline: DayActivity[];
  recentUsers: ActiveUserItem[];
};

export async function fetchAppStats(db: Db): Promise<StatsResponse> {
  const userCountsResult = await db.pool.query<{
    total_users: number;
    active_now: number;
    active_24h: number;
    active_7d: number;
    active_30d: number;
  }>(
    `
      WITH user_activity AS (
        SELECT
          u.id,
          GREATEST(
            COALESCE(u.last_seen_at, '1970-01-01'::timestamptz),
            COALESCE((SELECT MAX(created_at) FROM sessions WHERE user_id = u.id AND revoked_at IS NULL), '1970-01-01'::timestamptz),
            COALESCE((SELECT MAX(created_at) FROM library_sync_runs WHERE user_id = u.id), '1970-01-01'::timestamptz),
            COALESCE((SELECT MAX(updated_at) FROM evening_votes WHERE user_id = u.id), '1970-01-01'::timestamptz),
            COALESCE(u.updated_at, '1970-01-01'::timestamptz),
            COALESCE(u.created_at, '1970-01-01'::timestamptz)
          ) AS last_active_at
        FROM users u
        WHERE u.discord_id <> ALL($1::text[])
          AND lower(u.username) <> ALL($2::text[])
      )
      SELECT
        COUNT(*)::int AS total_users,
        COUNT(*) FILTER (WHERE last_active_at >= now() - interval '15 minutes')::int AS active_now,
        COUNT(*) FILTER (WHERE last_active_at >= now() - interval '24 hours')::int AS active_24h,
        COUNT(*) FILTER (WHERE last_active_at >= now() - interval '7 days')::int AS active_7d,
        COUNT(*) FILTER (WHERE last_active_at >= now() - interval '30 days')::int AS active_30d
      FROM user_activity
    `,
    [EXCLUDED_DISCORD_IDS, EXCLUDED_USERNAMES],
  );

  const overviewResult = await db.pool.query<{
    total_groups: number;
    total_evenings: number;
    completed_evenings: number;
    live_evenings: number;
    total_votes: number;
    total_user_games: number;
    unique_games: number;
    total_proposals: number;
  }>(
    `
      SELECT
        (
          SELECT COUNT(*)::int FROM groups g
          JOIN users u ON u.id = g.owner_id
          WHERE u.discord_id <> ALL($1::text[])
            AND lower(u.username) <> ALL($2::text[])
        ) AS total_groups,
        (
          SELECT COUNT(*)::int FROM evenings e
          JOIN users u ON u.id = e.created_by
          WHERE u.discord_id <> ALL($1::text[])
            AND lower(u.username) <> ALL($2::text[])
        ) AS total_evenings,
        (
          SELECT COUNT(*)::int FROM evenings e
          JOIN users u ON u.id = e.created_by
          WHERE e.status = 'closed'
            AND u.discord_id <> ALL($1::text[])
            AND lower(u.username) <> ALL($2::text[])
        ) AS completed_evenings,
        (
          SELECT COUNT(*)::int FROM evenings e
          JOIN users u ON u.id = e.created_by
          WHERE e.status IN ('lobby', 'selection', 'voting', 'revealed')
            AND u.discord_id <> ALL($1::text[])
            AND lower(u.username) <> ALL($2::text[])
        ) AS live_evenings,
        (
          SELECT COUNT(*)::int FROM evening_votes v
          JOIN users u ON u.id = v.user_id
          WHERE u.discord_id <> ALL($1::text[])
            AND lower(u.username) <> ALL($2::text[])
        ) AS total_votes,
        (
          SELECT COUNT(*)::int FROM user_games ug
          JOIN users u ON u.id = ug.user_id
          WHERE u.discord_id <> ALL($1::text[])
            AND lower(u.username) <> ALL($2::text[])
        ) AS total_user_games,
        (
          SELECT COUNT(DISTINCT ug.external_id)::int FROM user_games ug
          JOIN users u ON u.id = ug.user_id
          WHERE u.discord_id <> ALL($1::text[])
            AND lower(u.username) <> ALL($2::text[])
        ) AS unique_games,
        (
          SELECT COUNT(*)::int FROM game_proposals p
          JOIN users u ON u.id = p.created_by
          WHERE u.discord_id <> ALL($1::text[])
            AND lower(u.username) <> ALL($2::text[])
        ) AS total_proposals
    `,
    [EXCLUDED_DISCORD_IDS, EXCLUDED_USERNAMES],
  );

  const recentUsersResult = await db.pool.query<{
    id: string;
    discord_id: string;
    username: string;
    global_name: string | null;
    avatar: string | null;
    created_at: Date;
    last_active_at: Date;
    games_count: number;
    groups_count: number;
  }>(
    `
      WITH user_activity AS (
        SELECT
          u.id,
          u.discord_id,
          u.username,
          u.global_name,
          u.avatar,
          u.created_at,
          GREATEST(
            COALESCE(u.last_seen_at, '1970-01-01'::timestamptz),
            COALESCE((SELECT MAX(created_at) FROM sessions WHERE user_id = u.id AND revoked_at IS NULL), '1970-01-01'::timestamptz),
            COALESCE((SELECT MAX(created_at) FROM library_sync_runs WHERE user_id = u.id), '1970-01-01'::timestamptz),
            COALESCE((SELECT MAX(updated_at) FROM evening_votes WHERE user_id = u.id), '1970-01-01'::timestamptz),
            COALESCE(u.updated_at, '1970-01-01'::timestamptz),
            COALESCE(u.created_at, '1970-01-01'::timestamptz)
          ) AS last_active_at,
          (SELECT COUNT(*) FROM user_games WHERE user_id = u.id)::int AS games_count,
          (SELECT COUNT(*) FROM group_members WHERE user_id = u.id)::int AS groups_count
        FROM users u
        WHERE u.discord_id <> ALL($1::text[])
          AND lower(u.username) <> ALL($2::text[])
      )
      SELECT *
      FROM user_activity
      ORDER BY last_active_at DESC
      LIMIT 25
    `,
    [EXCLUDED_DISCORD_IDS, EXCLUDED_USERNAMES],
  );

  const timelineResult = await db.pool.query<DayActivity>(
    `
      WITH days AS (
        SELECT generate_series(
          date_trunc('day', now() - interval '13 days'),
          date_trunc('day', now()),
          interval '1 day'
        ) AS day
      ),
      user_activity AS (
        SELECT
          u.id,
          GREATEST(
            COALESCE(u.last_seen_at, '1970-01-01'::timestamptz),
            COALESCE((SELECT MAX(created_at) FROM sessions WHERE user_id = u.id AND revoked_at IS NULL), '1970-01-01'::timestamptz),
            COALESCE((SELECT MAX(created_at) FROM library_sync_runs WHERE user_id = u.id), '1970-01-01'::timestamptz),
            COALESCE((SELECT MAX(updated_at) FROM evening_votes WHERE user_id = u.id), '1970-01-01'::timestamptz),
            COALESCE(u.updated_at, '1970-01-01'::timestamptz),
            COALESCE(u.created_at, '1970-01-01'::timestamptz)
          ) AS last_active_at
        FROM users u
        WHERE u.discord_id <> ALL($1::text[])
          AND lower(u.username) <> ALL($2::text[])
      )
      SELECT
        to_char(days.day, 'YYYY-MM-DD') AS date,
        to_char(days.day, 'DD/MM') AS label,
        COUNT(ua.id)::int AS "activeCount"
      FROM days
      LEFT JOIN user_activity ua
        ON date_trunc('day', ua.last_active_at) = days.day
      GROUP BY days.day
      ORDER BY days.day ASC
    `,
    [EXCLUDED_DISCORD_IDS, EXCLUDED_USERNAMES],
  );

  const nowMs = Date.now();
  const fifteenMinutesMs = 15 * 60 * 1000;

  const recentUsers: ActiveUserItem[] = recentUsersResult.rows.map((row) => {
    const lastActiveTime = new Date(row.last_active_at).getTime();
    const isOnline = nowMs - lastActiveTime <= fifteenMinutesMs;
    return {
      id: row.id,
      discordId: row.discord_id,
      username: row.username,
      globalName: row.global_name,
      displayName: row.global_name || row.username,
      avatarUrl: discordAvatarUrl(row.discord_id, row.avatar),
      createdAt: new Date(row.created_at).toISOString(),
      lastActiveAt: new Date(row.last_active_at).toISOString(),
      isOnline,
      gamesCount: row.games_count,
      groupsCount: row.groups_count,
    };
  });

  const counts = userCountsResult.rows[0] ?? {
    total_users: 0,
    active_now: 0,
    active_24h: 0,
    active_7d: 0,
    active_30d: 0,
  };

  const overview = overviewResult.rows[0] ?? {
    total_groups: 0,
    total_evenings: 0,
    completed_evenings: 0,
    live_evenings: 0,
    total_votes: 0,
    total_user_games: 0,
    unique_games: 0,
    total_proposals: 0,
  };

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    excludedFiltered: {
      discordIds: EXCLUDED_DISCORD_IDS,
      usernames: EXCLUDED_USERNAMES,
    },
    activeUsers: {
      now: counts.active_now,
      last24h: counts.active_24h,
      last7d: counts.active_7d,
      last30d: counts.active_30d,
      total: counts.total_users,
    },
    overview: {
      totalGroups: overview.total_groups,
      totalEvenings: overview.total_evenings,
      completedEvenings: overview.completed_evenings,
      liveEvenings: overview.live_evenings,
      totalVotes: overview.total_votes,
      totalUserGames: overview.total_user_games,
      uniqueGames: overview.unique_games,
      totalProposals: overview.total_proposals,
    },
    timeline: timelineResult.rows,
    recentUsers,
  };
}

export type StatsRoutesOptions = {
  db: Db;
};

export const statsRoutes: FastifyPluginAsync<StatsRoutesOptions> = async (
  app,
  opts,
) => {
  const { db } = opts;

  function extractAdminCode(req: {
    headers: Record<string, string | string[] | undefined>;
    query: unknown;
  }): string | undefined {
    const headerCode = req.headers["x-admin-key"] || req.headers["x-admin-code"];
    if (typeof headerCode === "string") return headerCode;
    const query = req.query as { code?: string } | undefined;
    if (typeof query?.code === "string") return query.code;
    return undefined;
  }

  app.get<{
    Querystring: { code?: string };
  }>("/stats", async (request, reply) => {
    const code = extractAdminCode(request);
    if (!isValidAdminCode(code)) {
      return reply.code(401).send({
        ok: false,
        error: "unauthorized",
        message: "Code d'accès administrateur requis.",
      });
    }

    return fetchAppStats(db);
  });

  app.get<{
    Querystring: { code?: string };
  }>("/stats/active", async (request, reply) => {
    const code = extractAdminCode(request);
    if (!isValidAdminCode(code)) {
      return reply.code(401).send({
        ok: false,
        error: "unauthorized",
        message: "Code d'accès administrateur requis.",
      });
    }

    const stats = await fetchAppStats(db);
    return {
      ok: true,
      activeNow: stats.activeUsers.now,
      active24h: stats.activeUsers.last24h,
      total: stats.activeUsers.total,
    };
  });
};
