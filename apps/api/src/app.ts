import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import type { Env } from "./config.js";
import type { Db } from "./db.js";
import { authDiscordRoutes } from "./routes/auth-discord.js";
import { healthRoutes } from "./routes/health.js";

export async function buildApp(config: Env, db: Db) {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
    },
  });

  await app.register(sensible);
  await app.register(cookie, {
    secret: config.SESSION_SECRET,
  });
  await app.register(cors, {
    origin: [config.APP_URL, config.WEB_URL],
    credentials: true,
  });

  await app.register(healthRoutes, { db });
  await app.register(authDiscordRoutes, { config, db });

  app.get("/", async () => ({
    ok: true,
    name: "PlayNext API",
    docs: {
      health: "/health",
      discordStatus: "/auth/discord/status",
      discordLogin: "/auth/discord",
      me: "/auth/me",
      logout: "POST /auth/logout",
    },
  }));

  return app;
}
