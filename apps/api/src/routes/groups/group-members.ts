import type { FastifyInstance } from "fastify";
import {
  type GroupsRoutesOptions,
  requireUserId,
  transferSchema,
  setRoleSchema,
} from "./helpers.js";
import { getMembership } from "../../groups/membership.js";
import { canManageMember, isManager } from "../../groups/roles.js";

export function registerGroupMembersRoutes(
  app: FastifyInstance,
  opts: GroupsRoutesOptions,
) {
  const { db } = opts;

  app.post<{ Params: { groupId: string } }>(
    "/groups/:groupId/transfer",
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
      if (!membership || membership.role !== "owner") {
        return reply.code(403).send({ ok: false, error: "forbidden" });
      }

      const parsed = transferSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ ok: false, error: "invalid_body" });
      }
      if (parsed.data.userId === userId) {
        return reply.code(400).send({ ok: false, error: "already_owner" });
      }

      const target = await getMembership(
        db,
        request.params.groupId,
        parsed.data.userId,
      );
      if (!target) {
        return reply.code(404).send({ ok: false, error: "member_not_found" });
      }

      const client = await db.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `UPDATE groups SET owner_id = $2, updated_at = now() WHERE id = $1`,
          [request.params.groupId, parsed.data.userId],
        );
        await client.query(
          `UPDATE group_members SET role = 'member' WHERE group_id = $1 AND user_id = $2`,
          [request.params.groupId, userId],
        );
        await client.query(
          `UPDATE group_members SET role = 'owner' WHERE group_id = $1 AND user_id = $2`,
          [request.params.groupId, parsed.data.userId],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      return { ok: true };
    },
  );

  app.patch<{ Params: { groupId: string; memberId: string } }>(
    "/groups/:groupId/members/:memberId",
    async (request, reply) => {
      const userId = await requireUserId(db, request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }

      const actor = await getMembership(db, request.params.groupId, userId);
      if (!actor || !isManager(actor.role)) {
        return reply.code(403).send({ ok: false, error: "forbidden" });
      }

      const parsed = setRoleSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ ok: false, error: "invalid_body" });
      }

      const target = await getMembership(
        db,
        request.params.groupId,
        request.params.memberId,
      );
      if (!target) {
        return reply.code(404).send({ ok: false, error: "member_not_found" });
      }
      if (!canManageMember(actor.role, target.role)) {
        return reply.code(403).send({ ok: false, error: "forbidden" });
      }
      if (parsed.data.role === "admin" && actor.role !== "owner") {
        return reply.code(403).send({ ok: false, error: "owner_only_promote" });
      }

      await db.pool.query(
        `
          UPDATE group_members
          SET role = $3
          WHERE group_id = $1 AND user_id = $2
        `,
        [request.params.groupId, request.params.memberId, parsed.data.role],
      );

      return { ok: true, role: parsed.data.role };
    },
  );

  app.delete<{ Params: { groupId: string; memberId: string } }>(
    "/groups/:groupId/members/:memberId",
    async (request, reply) => {
      const userId = await requireUserId(db, request);
      if (!userId) {
        return reply.code(401).send({ ok: false, error: "unauthenticated" });
      }

      const actor = await getMembership(db, request.params.groupId, userId);
      if (!actor || !isManager(actor.role)) {
        return reply.code(403).send({ ok: false, error: "forbidden" });
      }

      const target = await getMembership(
        db,
        request.params.groupId,
        request.params.memberId,
      );
      if (!target) {
        return reply.code(404).send({ ok: false, error: "member_not_found" });
      }
      if (!canManageMember(actor.role, target.role)) {
        return reply.code(403).send({ ok: false, error: "forbidden" });
      }

      await db.pool.query(
        `DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`,
        [request.params.groupId, request.params.memberId],
      );
      await db.pool.query(
        `DELETE FROM group_hidden_games WHERE group_id = $1 AND user_id = $2`,
        [request.params.groupId, request.params.memberId],
      );

      return { ok: true };
    },
  );
}
