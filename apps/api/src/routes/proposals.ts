import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { getSessionToken } from "../auth/request-session.js";
import {
  discordAvatarUrl,
  findUserBySessionToken,
} from "../auth/session.js";
import type { Env } from "../config.js";
import type { Db } from "../db.js";
import { notifyGroupDiscord } from "../discord/notify.js";
import { getMembership } from "../groups/membership.js";
import { isManager } from "../groups/roles.js";
import { steamLibraryPosterUrl, steamStoreUrl } from "../meta/covers.js";
import {
  ownsProposedGame,
  proposalMemberStatus,
  type ProposalReplyValue,
} from "../proposals/status.js";

type ProposalsRoutesOptions = {
  db: Db;
  config: Env;
};

const createSchema = z.object({
  launcher: z.literal("steam"),
  externalId: z.string().min(1).max(32),
});

const replySchema = z.object({
  value: z.enum(["hot", "maybe", "later", "no"]),
});

type MemberRow = {
  user_id: string;
  discord_id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
};

type OwnedRow = {
  user_id: string;
  launcher: string;
  external_id: string;
  name: string;
};

type ProposalRow = {
  id: string;
  group_id: string;
  created_by: string;
  launcher: string;
  external_id: string;
  name: string;
  cover_url: string | null;
  steam_url: string;
  status: "open" | "closed";
  created_at: Date;
};

export const proposalsRoutes: FastifyPluginAsync<ProposalsRoutesOptions> = async (
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

  async function loadMembers(groupId: string): Promise<MemberRow[]> {
    const result = await db.pool.query<MemberRow>(
      `
        SELECT u.id AS user_id, u.discord_id, u.username, u.global_name, u.avatar
        FROM group_members m
        JOIN users u ON u.id = m.user_id
        WHERE m.group_id = $1
        ORDER BY m.joined_at ASC
      `,
      [groupId],
    );
    return result.rows;
  }

  async function loadOwnedGames(groupId: string): Promise<OwnedRow[]> {
    const result = await db.pool.query<OwnedRow>(
      `
        SELECT ug.user_id, ug.launcher, ug.external_id, ug.name
        FROM group_members m
        JOIN user_games ug ON ug.user_id = m.user_id
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
      `,
      [groupId],
    );
    return result.rows;
  }

  function displayName(row: MemberRow): string {
    return row.global_name?.trim() || row.username;
  }

  function serializeProposal(
    proposal: ProposalRow,
    members: MemberRow[],
    owned: OwnedRow[],
    replies: Map<string, ProposalReplyValue>,
    viewerId: string,
    viewerRole: "owner" | "admin" | "member",
  ) {
    const target = {
      launcher: proposal.launcher,
      externalId: proposal.external_id,
      name: proposal.name,
    };
    const gamesByUser = new Map<string, OwnedRow[]>();
    for (const game of owned) {
      const list = gamesByUser.get(game.user_id) ?? [];
      list.push(game);
      gamesByUser.set(game.user_id, list);
    }

    const people = members.map((member) => {
      const games = (gamesByUser.get(member.user_id) ?? []).map((game) => ({
        launcher: game.launcher,
        externalId: game.external_id,
        name: game.name,
      }));
      const owns = ownsProposedGame(games, target);
      const status = proposalMemberStatus({
        owns,
        reply: replies.get(member.user_id) ?? null,
      });
      return {
        userId: member.user_id,
        displayName: displayName(member),
        avatarUrl: discordAvatarUrl(member.discord_id, member.avatar),
        status,
      };
    });

    const ownedCount = people.filter((person) => person.status === "owns").length;
    const missing = people.filter((person) => person.status !== "owns");
    const pendingCount = missing.filter(
      (person) => person.status === "pending",
    ).length;
    const viewer = people.find((person) => person.userId === viewerId);
    const iOwn = viewer?.status === "owns";
    const myReply = replies.get(viewerId) ?? null;

    return {
      id: proposal.id,
      groupId: proposal.group_id,
      createdBy: proposal.created_by,
      launcher: "steam" as const,
      externalId: proposal.external_id,
      name: proposal.name,
      coverUrl: proposal.cover_url,
      steamUrl: proposal.steam_url,
      status: proposal.status,
      createdAt: proposal.created_at,
      ownedCount,
      memberCount: people.length,
      missingCount: missing.length,
      pendingCount,
      iOwn,
      myReply,
      canReply: proposal.status === "open" && !iOwn,
      canClose:
        proposal.status === "open" &&
        (proposal.created_by === viewerId || isManager(viewerRole)),
      members: people,
    };
  }

  async function loadReplies(
    proposalIds: string[],
  ): Promise<Map<string, Map<string, ProposalReplyValue>>> {
    const byProposal = new Map<string, Map<string, ProposalReplyValue>>();
    if (proposalIds.length === 0) return byProposal;
    const result = await db.pool.query<{
      proposal_id: string;
      user_id: string;
      value: ProposalReplyValue;
    }>(
      `
        SELECT proposal_id, user_id, value
        FROM game_proposal_replies
        WHERE proposal_id = ANY($1::uuid[])
      `,
      [proposalIds],
    );
    for (const row of result.rows) {
      const current = byProposal.get(row.proposal_id) ?? new Map();
      current.set(row.user_id, row.value);
      byProposal.set(row.proposal_id, current);
    }
    return byProposal;
  }

  app.get<{ Params: { groupId: string } }>(
    "/groups/:groupId/proposals",
    async (request, reply) => {
      const userId = await requireUserId(request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }
      const membership = await getMembership(db, request.params.groupId, userId);
      if (!membership) {
        return reply.code(403).send({ ok: false, error: "forbidden" });
      }

      const proposals = await db.pool.query<ProposalRow>(
        `
          SELECT id, group_id, created_by, launcher, external_id, name,
                 cover_url, steam_url, status, created_at
          FROM game_proposals
          WHERE group_id = $1 AND status = 'open'
          ORDER BY created_at DESC
        `,
        [request.params.groupId],
      );
      const [members, owned, replies] = await Promise.all([
        loadMembers(request.params.groupId),
        loadOwnedGames(request.params.groupId),
        loadReplies(proposals.rows.map((row) => row.id)),
      ]);

      return {
        ok: true,
        proposals: proposals.rows.map((row) =>
          serializeProposal(
            row,
            members,
            owned,
            replies.get(row.id) ?? new Map(),
            userId,
            membership.role,
          ),
        ),
      };
    },
  );

  app.post<{ Params: { groupId: string } }>(
    "/groups/:groupId/proposals",
    async (request, reply) => {
      const userId = await requireUserId(request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }
      const membership = await getMembership(db, request.params.groupId, userId);
      if (!membership) {
        return reply.code(403).send({ ok: false, error: "forbidden" });
      }

      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ ok: false, error: "invalid_body" });
      }

      const steamUrl = steamStoreUrl(parsed.data.externalId);
      if (!steamUrl) {
        return reply.code(400).send({
          ok: false,
          error: "not_steam",
          message: "Uniquement un jeu Steam.",
        });
      }

      const catalog = await db.pool.query<{
        launcher: string;
        external_id: string;
        name: string;
        cover_url: string | null;
      }>(
        `
          SELECT ug.launcher, ug.external_id, ug.name, gm.cover_url
          FROM group_members m
          JOIN user_games ug ON ug.user_id = m.user_id
          LEFT JOIN game_meta gm
            ON gm.launcher = ug.launcher AND gm.external_id = ug.external_id
          WHERE m.group_id = $1
            AND ug.launcher = 'steam'
            AND ug.external_id = $2
            AND ug.owned = true
            AND ug.hidden = false
          LIMIT 1
        `,
        [request.params.groupId, parsed.data.externalId],
      );
      const game = catalog.rows[0];
      if (!game) {
        return reply.code(404).send({
          ok: false,
          error: "game_not_in_group",
          message: "Jeu absent du groupe.",
        });
      }

      const [members, owned] = await Promise.all([
        loadMembers(request.params.groupId),
        loadOwnedGames(request.params.groupId),
      ]);
      const target = {
        launcher: "steam",
        externalId: game.external_id,
        name: game.name,
      };
      const missing = members.filter((member) => {
        const games = owned
          .filter((row) => row.user_id === member.user_id)
          .map((row) => ({
            launcher: row.launcher,
            externalId: row.external_id,
            name: row.name,
          }));
        return !ownsProposedGame(games, target);
      });
      if (missing.length === 0) {
        return reply.code(409).send({
          ok: false,
          error: "everyone_owns",
          message: "Tout le monde l’a.",
        });
      }

      const coverUrl =
        game.cover_url || steamLibraryPosterUrl(game.external_id);
      try {
        const inserted = await db.pool.query<ProposalRow>(
          `
            INSERT INTO game_proposals (
              group_id, created_by, launcher, external_id, name,
              cover_url, steam_url, status
            )
            VALUES ($1, $2, 'steam', $3, $4, $5, $6, 'open')
            RETURNING id, group_id, created_by, launcher, external_id, name,
                      cover_url, steam_url, status, created_at
          `,
          [
            request.params.groupId,
            userId,
            game.external_id,
            game.name,
            coverUrl,
            steamUrl,
          ],
        );
        const proposal = inserted.rows[0]!;
        const view = serializeProposal(
          proposal,
          members,
          owned,
          new Map(),
          userId,
          membership.role,
        );
        void notifyGroupDiscord(db, config, request.params.groupId, {
          kind: "proposal",
          gameName: game.name,
          steamUrl,
          ownedCount: view.ownedCount,
          memberCount: view.memberCount,
          missingNames: missing.map(displayName),
          coverUrl,
        }).catch((error) => {
          request.log.warn(
            { err: error, groupId: request.params.groupId },
            "discord_notify_failed",
          );
        });
        return reply.code(201).send({ ok: true, proposal: view });
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error
            ? String((error as { code?: string }).code)
            : "";
        if (code === "23505") {
          return reply.code(409).send({
            ok: false,
            error: "already_open",
            message: "Déjà proposé.",
          });
        }
        throw error;
      }
    },
  );

  app.post<{ Params: { groupId: string; proposalId: string } }>(
    "/groups/:groupId/proposals/:proposalId/reply",
    async (request, reply) => {
      const userId = await requireUserId(request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }
      const membership = await getMembership(db, request.params.groupId, userId);
      if (!membership) {
        return reply.code(403).send({ ok: false, error: "forbidden" });
      }
      const parsed = replySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ ok: false, error: "invalid_body" });
      }

      const found = await db.pool.query<ProposalRow>(
        `
          SELECT id, group_id, created_by, launcher, external_id, name,
                 cover_url, steam_url, status, created_at
          FROM game_proposals
          WHERE id = $1 AND group_id = $2
        `,
        [request.params.proposalId, request.params.groupId],
      );
      const proposal = found.rows[0];
      if (!proposal) {
        return reply.code(404).send({ ok: false, error: "not_found" });
      }
      if (proposal.status !== "open") {
        return reply.code(409).send({
          ok: false,
          error: "closed",
          message: "Proposition close.",
        });
      }

      const [members, owned] = await Promise.all([
        loadMembers(request.params.groupId),
        loadOwnedGames(request.params.groupId),
      ]);
      const myGames = owned
        .filter((row) => row.user_id === userId)
        .map((row) => ({
          launcher: row.launcher,
          externalId: row.external_id,
          name: row.name,
        }));
      if (
        ownsProposedGame(myGames, {
          launcher: proposal.launcher,
          externalId: proposal.external_id,
          name: proposal.name,
        })
      ) {
        return reply.code(409).send({
          ok: false,
          error: "already_owns",
          message: "Tu as déjà le jeu.",
        });
      }

      await db.pool.query(
        `
          INSERT INTO game_proposal_replies (proposal_id, user_id, value, updated_at)
          VALUES ($1, $2, $3, now())
          ON CONFLICT (proposal_id, user_id) DO UPDATE SET
            value = EXCLUDED.value,
            updated_at = now()
        `,
        [proposal.id, userId, parsed.data.value],
      );
      const replies = await loadReplies([proposal.id]);
      return {
        ok: true,
        proposal: serializeProposal(
          proposal,
          members,
          owned,
          replies.get(proposal.id) ?? new Map(),
          userId,
          membership.role,
        ),
      };
    },
  );

  app.post<{ Params: { groupId: string; proposalId: string } }>(
    "/groups/:groupId/proposals/:proposalId/close",
    async (request, reply) => {
      const userId = await requireUserId(request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }
      const membership = await getMembership(db, request.params.groupId, userId);
      if (!membership) {
        return reply.code(403).send({ ok: false, error: "forbidden" });
      }

      const found = await db.pool.query<ProposalRow>(
        `
          SELECT id, group_id, created_by, launcher, external_id, name,
                 cover_url, steam_url, status, created_at
          FROM game_proposals
          WHERE id = $1 AND group_id = $2
        `,
        [request.params.proposalId, request.params.groupId],
      );
      const proposal = found.rows[0];
      if (!proposal) {
        return reply.code(404).send({ ok: false, error: "not_found" });
      }
      if (
        proposal.created_by !== userId &&
        !isManager(membership.role)
      ) {
        return reply.code(403).send({ ok: false, error: "forbidden" });
      }
      if (proposal.status !== "open") {
        return reply.code(409).send({
          ok: false,
          error: "closed",
          message: "Proposition close.",
        });
      }

      await db.pool.query(
        `
          UPDATE game_proposals
          SET status = 'closed', closed_at = now(), updated_at = now()
          WHERE id = $1
        `,
        [proposal.id],
      );
      return { ok: true };
    },
  );
};
