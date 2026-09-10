import { randomBytes } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { getSessionToken } from "../../auth/request-session.js";
import { findUserBySessionToken } from "../../auth/session.js";
import type { Env } from "../../config.js";
import type { Db } from "../../db.js";
import type { GroupRole } from "../../groups/roles.js";

export type GroupsRoutesOptions = {
  db: Db;
  config: Env;
};

export async function requireUserId(
  db: Db,
  request: FastifyRequest,
): Promise<string | null> {
  const user = await findUserBySessionToken(db, getSessionToken(request));
  return user?.id ?? null;
}

const imageUrlSchema = z
  .union([z.string().url().max(512), z.literal(""), z.null()])
  .optional();

export const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(64),
  imageUrl: imageUrlSchema,
});

export const patchGroupSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  imageUrl: imageUrlSchema,
});

export const createInviteSchema = z.object({
  expiresInDays: z.number().int().min(1).max(90).optional(),
  maxUses: z.number().int().min(1).max(1000).optional().nullable(),
});

export const setRoleSchema = z.object({
  role: z.enum(["admin", "member"]),
});

export const transferSchema = z.object({
  userId: z.string().uuid(),
});

export const hideGameSchema = z.object({
  launcher: z.string().min(1).max(32),
  externalId: z.string().min(1).max(256),
});

export function newInviteCode(): string {
  return randomBytes(9).toString("base64url");
}

export function inviteDeepLink(code: string): string {
  return `playnext://invite/${code}`;
}

export function normalizeImageUrl(value: string | null | undefined): string | null {
  if (value === null || value === "" || value === undefined) return null;
  return value;
}

export async function loadGroupSummary(db: Db, groupId: string) {
  const result = await db.pool.query<{
    id: string;
    name: string;
    image_url: string | null;
    owner_id: string;
    created_at: Date;
    updated_at: Date;
    member_count: string;
  }>(
    `
      SELECT g.id, g.name, g.image_url, g.owner_id, g.created_at, g.updated_at,
             COUNT(m.user_id)::text AS member_count
      FROM groups g
      JOIN group_members m ON m.group_id = g.id
      WHERE g.id = $1
      GROUP BY g.id
    `,
    [groupId],
  );
  return result.rows[0] ?? null;
}

export function mapGroup(
  row: {
    id: string;
    name: string;
    image_url: string | null;
    owner_id: string;
    created_at: Date;
    updated_at: Date;
    member_count?: string;
  },
  myRole?: GroupRole,
) {
  return {
    id: row.id,
    name: row.name,
    imageUrl: row.image_url,
    ownerId: row.owner_id,
    memberCount: row.member_count ? Number(row.member_count) : undefined,
    myRole,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
