import type { FastifyRequest } from "fastify";
import { SESSION_COOKIE } from "./session.js";

/** Prefer Bearer (desktop), then query token (SSE EventSource), fall back to cookie (web preview). */
export function getSessionToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length).trim();
    if (token) return token;
  }
  const query = request.query as Record<string, unknown> | undefined;
  if (typeof query?.token === "string" && query.token.trim()) {
    return query.token.trim();
  }
  return request.cookies[SESSION_COOKIE];
}
