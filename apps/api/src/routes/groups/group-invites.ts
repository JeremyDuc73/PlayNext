import type { FastifyInstance } from "fastify";
import {
  type GroupsRoutesOptions,
  requireUserId,
  createInviteSchema,
  newInviteCode,
  inviteDeepLink,
} from "./helpers.js";
import { getMembership } from "../../groups/membership.js";
import { isManager } from "../../groups/roles.js";

export function registerGroupInvitesRoutes(
  app: FastifyInstance,
  opts: GroupsRoutesOptions,
) {
  const { db } = opts;

  app.post<{ Params: { groupId: string } }>(
    "/groups/:groupId/invites",
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

      const parsed = createInviteSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ ok: false, error: "invalid_body" });
      }

      const code = newInviteCode();
      const expiresAt = parsed.data.expiresInDays
        ? new Date(
            Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000,
          )
        : null;

      const inserted = await db.pool.query<{
        id: string;
        code: string;
        expires_at: Date | null;
        max_uses: number | null;
        use_count: number;
        created_at: Date;
      }>(
        `
          INSERT INTO group_invites (
            group_id, code, created_by, expires_at, max_uses
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, code, expires_at, max_uses, use_count, created_at
        `,
        [
          request.params.groupId,
          code,
          userId,
          expiresAt,
          parsed.data.maxUses ?? null,
        ],
      );
      const row = inserted.rows[0]!;

      return reply.code(201).send({
        ok: true,
        invite: {
          id: row.id,
          code: row.code,
          deepLink: inviteDeepLink(row.code),
          expiresAt: row.expires_at,
          maxUses: row.max_uses,
          useCount: row.use_count,
          createdAt: row.created_at,
        },
      });
    },
  );

  app.get<{ Params: { groupId: string } }>(
    "/groups/:groupId/invites",
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
        id: string;
        code: string;
        expires_at: Date | null;
        max_uses: number | null;
        use_count: number;
        revoked_at: Date | null;
        created_at: Date;
      }>(
        `
          SELECT id, code, expires_at, max_uses, use_count, revoked_at, created_at
          FROM group_invites
          WHERE group_id = $1
          ORDER BY created_at DESC
          LIMIT 50
        `,
        [request.params.groupId],
      );

      return {
        ok: true,
        invites: result.rows.map((row) => ({
          id: row.id,
          code: row.code,
          deepLink: inviteDeepLink(row.code),
          expiresAt: row.expires_at,
          maxUses: row.max_uses,
          useCount: row.use_count,
          revokedAt: row.revoked_at,
          active:
            !row.revoked_at &&
            (!row.expires_at || row.expires_at > new Date()) &&
            (row.max_uses == null || row.use_count < row.max_uses),
          createdAt: row.created_at,
        })),
      };
    },
  );

  app.delete<{ Params: { groupId: string; inviteId: string } }>(
    "/groups/:groupId/invites/:inviteId",
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
          UPDATE group_invites
          SET revoked_at = now()
          WHERE id = $1 AND group_id = $2 AND revoked_at IS NULL
        `,
        [request.params.inviteId, request.params.groupId],
      );

      return { ok: true };
    },
  );

  app.get<{ Params: { code: string } }>(
    "/invites/:code",
    async (request, reply) => {
      const userId = await requireUserId(db, request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }

      const invite = await db.pool.query<{
        id: string;
        group_id: string;
        code: string;
        expires_at: Date | null;
        max_uses: number | null;
        use_count: number;
        revoked_at: Date | null;
        name: string;
        image_url: string | null;
        member_count: string;
      }>(
        `
          SELECT i.id, i.group_id, i.code, i.expires_at, i.max_uses, i.use_count,
                 i.revoked_at, g.name, g.image_url,
                 COUNT(m.user_id)::text AS member_count
          FROM group_invites i
          JOIN groups g ON g.id = i.group_id
          JOIN group_members m ON m.group_id = g.id
          WHERE i.code = $1
          GROUP BY i.id, g.id
        `,
        [request.params.code],
      );
      const row = invite.rows[0];
      if (!row) {
        return reply.code(404).send({ ok: false, error: "invite_not_found" });
      }

      const membership = await getMembership(db, row.group_id, userId);
      const expired = Boolean(row.expires_at && row.expires_at <= new Date());
      const exhausted =
        row.max_uses != null && row.use_count >= row.max_uses;
      const revoked = Boolean(row.revoked_at);
      const joinable = !revoked && !expired && !exhausted && !membership;

      return {
        ok: true,
        invite: {
          code: row.code,
          deepLink: inviteDeepLink(row.code),
          group: {
            id: row.group_id,
            name: row.name,
            imageUrl: row.image_url,
            memberCount: Number(row.member_count),
          },
          alreadyMember: Boolean(membership),
          joinable,
          reason: revoked
            ? "revoked"
            : expired
              ? "expired"
              : exhausted
                ? "exhausted"
                : membership
                  ? "already_member"
                  : null,
        },
      };
    },
  );

  app.post<{ Params: { code: string } }>(
    "/invites/:code/join",
    async (request, reply) => {
      const userId = await requireUserId(db, request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }

      const client = await db.pool.connect();
      try {
        await client.query("BEGIN");
        const invite = await client.query<{
          id: string;
          group_id: string;
          expires_at: Date | null;
          max_uses: number | null;
          use_count: number;
          revoked_at: Date | null;
        }>(
          `
            SELECT id, group_id, expires_at, max_uses, use_count, revoked_at
            FROM group_invites
            WHERE code = $1
            FOR UPDATE
          `,
          [request.params.code],
        );
        const row = invite.rows[0];
        if (!row) {
          await client.query("ROLLBACK");
          return reply
            .code(404)
            .send({ ok: false, error: "invite_not_found" });
        }
        if (row.revoked_at) {
          await client.query("ROLLBACK");
          return reply.code(410).send({ ok: false, error: "invite_revoked" });
        }
        if (row.expires_at && row.expires_at <= new Date()) {
          await client.query("ROLLBACK");
          return reply.code(410).send({ ok: false, error: "invite_expired" });
        }
        if (row.max_uses != null && row.use_count >= row.max_uses) {
          await client.query("ROLLBACK");
          return reply
            .code(410)
            .send({ ok: false, error: "invite_exhausted" });
        }

        const existing = await client.query(
          `SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2`,
          [row.group_id, userId],
        );
        if (existing.rowCount && existing.rowCount > 0) {
          await client.query("COMMIT");
          return {
            ok: true,
            alreadyMember: true,
            groupId: row.group_id,
          };
        }

        await client.query(
          `
            INSERT INTO group_members (group_id, user_id, role)
            VALUES ($1, $2, 'member')
          `,
          [row.group_id, userId],
        );
        await client.query(
          `
            UPDATE group_invites
            SET use_count = use_count + 1
            WHERE id = $1
          `,
          [row.id],
        );
        await client.query("COMMIT");
        return { ok: true, alreadyMember: false, groupId: row.group_id };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  );
}
