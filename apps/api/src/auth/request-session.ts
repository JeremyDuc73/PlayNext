import type { FastifyRequest } from "fastify";
import { SESSION_COOKIE } from "./session.js";

/** Prefer Bearer (desktop), fall back to cookie (web preview). */
export function getSessionToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length).trim();
    if (token) return token;
  }
  return request.cookies[SESSION_COOKIE];
}
