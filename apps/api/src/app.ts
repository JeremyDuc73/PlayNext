import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import type { Env } from "./config.js";
import type { Db } from "./db.js";
import { authDiscordRoutes } from "./routes/auth-discord.js";
import { healthRoutes } from "./routes/health.js";
import { libraryRoutes } from "./routes/library.js";

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
  // Packaged Tauri on Windows uses https://tauri.localhost (not APP_URL).
  const corsOrigins = [
    config.APP_URL,
    config.WEB_URL,
    "https://tauri.localhost",
    "http://tauri.localhost",
    "tauri://localhost",
  ];

  await app.register(cors, {
    origin: corsOrigins,
    credentials: true,
  });

  await app.register(healthRoutes, { db });
  await app.register(authDiscordRoutes, { config, db });
  await app.register(libraryRoutes, { db });

  app.get("/", async () => ({
    ok: true,
    name: "PlayNext API",
    docs: {
      health: "/health",
      discordStatus: "/auth/discord/status",
      discordLogin: "/auth/discord",
      me: "/auth/me",
      logout: "POST /auth/logout",
      librarySync: "POST /library/sync",
      libraryMe: "GET /library/me",
    },
  }));

  return app;
}
