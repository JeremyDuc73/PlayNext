/**
 * Local solo testing helper: creates a second fake Discord user + session.
 * Usage: npm run seed:buddy
 * Optional: npm run seed:buddy -- --join <inviteCode>
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config.js";
import { createDb } from "../db.js";
import { createSession } from "../auth/session.js";
import { migrate } from "../migrate.js";

const here = fileURLToPath(new URL(".", import.meta.url));
loadEnv({ path: resolve(here, "../../../../.env") });
loadEnv();

const BUDDY_DISCORD_ID = "dev_buddy_playnext";
const SAMPLE_GAMES = [
  {
    launcher: "steam",
    externalId: "730",
    name: "Counter-Strike 2",
    installed: true,
  },
  {
    launcher: "steam",
    externalId: "570",
    name: "Dota 2",
    installed: false,
  },
  {
    launcher: "steam",
    externalId: "1245620",
    name: "ELDEN RING",
    installed: true,
  },
  {
    launcher: "epic",
    externalId: "Fortnite",
    name: "Fortnite",
    installed: true,
  },
] as const;

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

async function main() {
  const config = loadConfig();
  const db = createDb(config);
  await migrate(db);

  const user = await db.pool.query<{ id: string; username: string }>(
    `
      INSERT INTO users (discord_id, username, global_name, avatar)
      VALUES ($1, 'buddy', 'Buddy Dev', NULL)
      ON CONFLICT (discord_id) DO UPDATE SET
        username = EXCLUDED.username,
        global_name = EXCLUDED.global_name,
        updated_at = now()
      RETURNING id, username
    `,
    [BUDDY_DISCORD_ID],
  );
  const buddy = user.rows[0]!;

  for (const game of SAMPLE_GAMES) {
    await db.pool.query(
      `
        INSERT INTO user_games (
          user_id, launcher, external_id, name, installed, owned, launchable
        )
        VALUES ($1, $2, $3, $4, $5, true, $5)
        ON CONFLICT (user_id, launcher, external_id) DO UPDATE SET
          name = EXCLUDED.name,
          installed = EXCLUDED.installed,
          owned = true,
          launchable = EXCLUDED.launchable,
          updated_at = now()
      `,
      [buddy.id, game.launcher, game.externalId, game.name, game.installed],
    );
  }

  const { token } = await createSession(db, buddy.id);

  const joinCode = argValue("--join");
  let joinedGroupId: string | null = null;
  if (joinCode) {
    const invite = await db.pool.query<{
      id: string;
      group_id: string;
      revoked_at: Date | null;
      expires_at: Date | null;
      max_uses: number | null;
      use_count: number;
    }>(
      `
        SELECT id, group_id, revoked_at, expires_at, max_uses, use_count
        FROM group_invites
        WHERE code = $1
      `,
      [joinCode],
    );
    const row = invite.rows[0];
    if (!row) {
      console.error(`Invite introuvable: ${joinCode}`);
    } else if (row.revoked_at) {
      console.error("Invite révoquée.");
    } else if (row.expires_at && row.expires_at <= new Date()) {
      console.error("Invite expirée.");
    } else if (row.max_uses != null && row.use_count >= row.max_uses) {
      console.error("Invite épuisée.");
    } else {
      await db.pool.query(
        `
          INSERT INTO group_members (group_id, user_id, role)
          VALUES ($1, $2, 'member')
          ON CONFLICT DO NOTHING
        `,
        [row.group_id, buddy.id],
      );
      await db.pool.query(
        `UPDATE group_invites SET use_count = use_count + 1 WHERE id = $1`,
        [row.id],
      );
      joinedGroupId = row.group_id;
    }
  }

  const ui = config.APP_URL.replace(/\/$/, "");

  console.log("");
  console.log("Buddy prêt (compte local factice).");
  console.log(`  user: ${buddy.username} (${buddy.id})`);
  console.log(`  jeux sample: ${SAMPLE_GAMES.length}`);
  if (joinedGroupId) {
    console.log(`  rejoint le groupe: ${joinedGroupId}`);
  }
  console.log("");
  console.log("Token session:");
  console.log(token);
  console.log("");
  console.log("Dans un 2e navigateur / profil (aperçu web Vite) :");
  console.log(`  1. Ouvre ${ui}`);
  console.log("  2. DevTools → Console :");
  console.log(
    `     localStorage.setItem("playnext_session", ${JSON.stringify(token)}); location.reload();`,
  );
  console.log("");
  console.log("Ou rejoins une invite depuis ce script :");
  console.log("  npm run seed:buddy -- --join <CODE>");
  console.log("");

  await db.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
