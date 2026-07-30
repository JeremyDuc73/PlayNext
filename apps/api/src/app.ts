import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import type { Env } from "./config.js";
import type { Db } from "./db.js";
import { authDiscordRoutes } from "./routes/auth-discord.js";
import { authEpicRoutes } from "./routes/auth-epic.js";
import { authMicrosoftRoutes } from "./routes/auth-microsoft.js";
import { eveningsRoutes } from "./routes/evenings.js";
import { groupsRoutes } from "./routes/groups.js";
import { healthRoutes } from "./routes/health.js";
import { libraryRoutes } from "./routes/library.js";
import { metaRoutes } from "./routes/meta.js";

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
  await app.register(authMicrosoftRoutes, { config, db });
  await app.register(authEpicRoutes, { config, db });
  await app.register(libraryRoutes, { db, config });
  await app.register(groupsRoutes, { db });
  await app.register(eveningsRoutes, { db });
  await app.register(metaRoutes, { db });

  app.get("/", async () => ({
    ok: true,
    name: "PlayNext API",
    docs: {
      health: "/health",
      discordStatus: "/auth/discord/status",
      discordLogin: "/auth/discord",
      microsoftStatus: "/auth/microsoft/status",
      microsoftStart: "POST /auth/microsoft/start",
      epicStatus: "/auth/epic/status",
      epicStart: "POST /auth/epic/start",
      epicExchange: "POST /auth/epic/exchange",
      me: "/auth/me",
      logout: "POST /auth/logout",
      librarySync: "POST /library/sync",
      libraryXboxSync: "POST /library/xbox/sync",
      libraryEpicSync: "POST /library/epic/sync",
      libraryMe: "GET /library/me",
      groups: "GET /groups",
      createGroup: "POST /groups",
      joinInvite: "POST /invites/:code/join",
      createEvening: "POST /groups/:groupId/evenings",
      evening: "GET /evenings/:eveningId",
      eveningVotes: "POST /evenings/:eveningId/votes",
    },
  }));

  return app;
}
