import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { createDb } from "./db.js";
import { buildApp } from "./app.js";
import { migrate } from "./migrate.js";

const here = fileURLToPath(new URL(".", import.meta.url));
loadEnv({ path: resolve(here, "../../../.env") });
loadEnv(); // allow apps/api/.env override in local experiments

async function main() {
  const config = loadConfig();
  const db = createDb(config);

  try {
    await migrate(db);
  } catch (error) {
    console.error("Database migration failed", error);
    await db.close();
    process.exit(1);
  }

  const app = await buildApp(config, db);

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "Shutting down");
    await app.close();
    await db.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  try {
    await app.listen({ host: config.HOST, port: config.PORT });
  } catch (error) {
    app.log.error(error);
    await db.close();
    process.exit(1);
  }
}

void main();
