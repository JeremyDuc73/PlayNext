import type { FastifyPluginAsync } from "fastify";
import type { Db } from "../db.js";

type HealthRoutesOptions = {
  db: Db;
};

export const healthRoutes: FastifyPluginAsync<HealthRoutesOptions> = async (
  app,
  opts,
) => {
  app.get("/health", async () => {
    let database: "up" | "down" = "down";

    try {
      await opts.db.ping();
      database = "up";
    } catch {
      database = "down";
    }

    const ok = database === "up";

    return {
      ok,
      service: "playnext-api",
      version: "0.1.0",
      database,
      timestamp: new Date().toISOString(),
    };
  });
};
