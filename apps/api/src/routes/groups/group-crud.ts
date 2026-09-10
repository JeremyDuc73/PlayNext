import type { FastifyInstance } from "fastify";
import {
  type GroupsRoutesOptions,
  requireUserId,
  createGroupSchema,
  patchGroupSchema,
  normalizeImageUrl,
  loadGroupSummary,
  mapGroup,
} from "./helpers.js";
import { getMembership } from "../../groups/membership.js";
import { isManager, type GroupRole } from "../../groups/roles.js";
import { toPublicUser } from "../../auth/session.js";

export function registerGroupCrudRoutes(
  app: FastifyInstance,
  opts: GroupsRoutesOptions,
) {
  const { db } = opts;

  app.get("/groups", async (request, reply) => {
    const userId = await requireUserId(db, request);
    if (!userId) {
      return reply.code(401).send({ ok: false, error: "unauthenticated" });
    }

    const result = await db.pool.query<{
      id: string;
      name: string;
      image_url: string | null;
      owner_id: string;
      proposal_rule: string | null;
      proposal_threshold: number | null;
      created_at: Date;
      updated_at: Date;
      my_role: GroupRole;
      member_count: string;
    }>(
      `
        SELECT g.id, g.name, g.image_url, g.owner_id, g.proposal_rule, g.proposal_threshold,
               g.created_at, g.updated_at,
               mine.role AS my_role,
               COUNT(all_m.user_id)::text AS member_count
        FROM group_members mine
        JOIN groups g ON g.id = mine.group_id
        JOIN group_members all_m ON all_m.group_id = g.id
        WHERE mine.user_id = $1
        GROUP BY g.id, mine.role
        ORDER BY g.name ASC
      `,
      [userId],
    );

    return {
      ok: true,
      groups: result.rows.map((row) => mapGroup(row, row.my_role)),
    };
  });

  app.post("/groups", async (request, reply) => {
    const userId = await requireUserId(db, request);
    if (!userId) {
      return reply.code(401).send({ ok: false, error: "unauthenticated" });
    }

    const parsed = createGroupSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: "invalid_body",
        details: parsed.error.flatten(),
      });
    }

    const imageUrl = normalizeImageUrl(parsed.data.imageUrl ?? null);
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      const group = await client.query<{
        id: string;
        name: string;
        image_url: string | null;
        owner_id: string;
        created_at: Date;
        updated_at: Date;
      }>(
        `
          INSERT INTO groups (name, image_url, owner_id)
          VALUES ($1, $2, $3)
          RETURNING id, name, image_url, owner_id, created_at, updated_at
        `,
        [parsed.data.name, imageUrl, userId],
      );
      const row = group.rows[0]!;
      await client.query(
        `
          INSERT INTO group_members (group_id, user_id, role)
          VALUES ($1, $2, 'owner')
        `,
        [row.id, userId],
      );
      await client.query("COMMIT");
      return reply.code(201).send({
        ok: true,
        group: { ...mapGroup(row, "owner"), memberCount: 1 },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  app.get<{ Params: { groupId: string } }>(
    "/groups/:groupId",
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
      if (!membership) {
        return reply.code(404).send({ ok: false, error: "group_not_found" });
      }

      const summary = await loadGroupSummary(db, request.params.groupId);
      if (!summary) {
        return reply.code(404).send({ ok: false, error: "group_not_found" });
      }

      const members = await db.pool.query<{
        user_id: string;
        role: GroupRole;
        joined_at: Date;
        discord_id: string;
        username: string;
        global_name: string | null;
        avatar: string | null;
      }>(
        `
          SELECT m.user_id, m.role, m.joined_at,
                 u.discord_id, u.username, u.global_name, u.avatar
          FROM group_members m
          JOIN users u ON u.id = m.user_id
          WHERE m.group_id = $1
          ORDER BY
            CASE m.role
              WHEN 'owner' THEN 0
              WHEN 'admin' THEN 1
              ELSE 2
            END,
            COALESCE(u.global_name, u.username) ASC
        `,
        [request.params.groupId],
      );

      return {
        ok: true,
        group: mapGroup(summary, membership.role),
        members: members.rows.map((row) => ({
          ...toPublicUser({
            user_id: row.user_id,
            discord_id: row.discord_id,
            username: row.username,
            global_name: row.global_name,
            avatar: row.avatar,
          }),
          role: row.role,
          joinedAt: row.joined_at,
        })),
      };
    },
  );

  app.patch<{ Params: { groupId: string } }>(
    "/groups/:groupId",
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

      const parsed = patchGroupSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          ok: false,
          error: "invalid_body",
          details: parsed.error.flatten(),
        });
      }
      if (
        parsed.data.name === undefined &&
        parsed.data.imageUrl === undefined &&
        parsed.data.proposalRule === undefined &&
        parsed.data.proposalThreshold === undefined
      ) {
        return reply.code(400).send({ ok: false, error: "nothing_to_update" });
      }

      const current = await loadGroupSummary(db, request.params.groupId);
      if (!current) {
        return reply.code(404).send({ ok: false, error: "group_not_found" });
      }

      const nextName = parsed.data.name ?? current.name;
      const nextImage =
        parsed.data.imageUrl === undefined
          ? current.image_url
          : normalizeImageUrl(parsed.data.imageUrl);
      const nextRule = parsed.data.proposalRule ?? current.proposal_rule ?? "unanimous";
      const nextThreshold = parsed.data.proposalThreshold ?? current.proposal_threshold ?? 3;

      const updated = await db.pool.query<{
        id: string;
        name: string;
        image_url: string | null;
        owner_id: string;
        proposal_rule: string;
        proposal_threshold: number;
        created_at: Date;
        updated_at: Date;
      }>(
        `
          UPDATE groups
          SET name = $2, image_url = $3, proposal_rule = $4, proposal_threshold = $5, updated_at = now()
          WHERE id = $1
          RETURNING id, name, image_url, owner_id, proposal_rule, proposal_threshold, created_at, updated_at
        `,
        [request.params.groupId, nextName, nextImage, nextRule, nextThreshold],
      );

      return {
        ok: true,
        group: mapGroup(
          {
            ...updated.rows[0]!,
            member_count: current.member_count,
          },
          membership.role,
        ),
      };
    },
  );

  app.delete<{ Params: { groupId: string } }>(
    "/groups/:groupId",
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

      await db.pool.query(`DELETE FROM groups WHERE id = $1`, [
        request.params.groupId,
      ]);
      return { ok: true };
    },
  );

  app.post<{ Params: { groupId: string } }>(
    "/groups/:groupId/leave",
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
      if (!membership) {
        return reply.code(404).send({ ok: false, error: "not_a_member" });
      }
      if (membership.role === "owner") {
        return reply.code(400).send({
          ok: false,
          error: "owner_must_transfer",
          message:
            "Transfère la propriété avant de quitter, ou supprime le groupe.",
        });
      }

      await db.pool.query(
        `DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`,
        [request.params.groupId, userId],
      );
      await db.pool.query(
        `DELETE FROM group_hidden_games WHERE group_id = $1 AND user_id = $2`,
        [request.params.groupId, userId],
      );
      return { ok: true };
    },
  );
}
