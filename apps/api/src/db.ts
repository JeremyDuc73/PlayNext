import pg from "pg";
import type { Env } from "./config.js";

const { Pool } = pg;

export type Db = {
  pool: pg.Pool;
  ping: () => Promise<void>;
  close: () => Promise<void>;
};

export function createDb(config: Env): Db {
  const pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: 10,
  });

  return {
    pool,
    async ping() {
      await pool.query("select 1");
    },
    async close() {
      await pool.end();
    },
  };
}
