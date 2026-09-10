import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { getSessionToken } from "../../auth/request-session.js";
import { findUserBySessionToken } from "../../auth/session.js";
import type { Env } from "../../config.js";
import type { Db } from "../../db.js";

export type EveningsRoutesOptions = {
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

export const vibeSchema = z.enum([
  "chill",
  "competitive",
  "campaign",
  "party",
  "any",
]);

export const createEveningSchema = z.object({
  kind: z.enum(["ritual", "direct"]).optional().default("ritual"),
  title: z.string().trim().min(1).max(80).optional(),
  durationMinutes: z.number().int().min(15).max(600).optional().nullable(),
  vibe: vibeSchema.optional().nullable(),
  requireOwned: z.boolean().optional().default(false),
  requireInstalled: z.boolean().optional().default(false),
  shortlistSize: z.number().int().min(1).max(5).optional().default(3),
  participantIds: z.array(z.string().uuid()).min(1).max(32).optional(),
  scheduledAt: z.string().min(16).max(40).optional(),
  appId: z.string().regex(/^\d{1,32}$/).optional(),
});

export const votesSchema = z.object({
  votes: z
    .array(
      z.object({
        candidateId: z.string().uuid(),
        value: z.enum(["hot", "maybe", "pass", "veto"]),
      }),
    )
    .min(1)
    .max(20),
});

export const selectionSchema = z.object({
  candidateIds: z.array(z.string().uuid()).min(1).max(5),
});

export const currentVoteSchema = z.object({
  candidateId: z.string().uuid(),
  value: z.enum(["hot", "maybe", "pass", "veto"]),
});

export const closeSchema = z.object({
  candidateId: z.string().uuid().optional(),
});
