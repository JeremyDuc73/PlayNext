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
import { fetchSteamGroupPlayable } from "../steam/store.js";

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
    launcher: "steam",
    externalId: "728880",
    name: "Overcooked! 2",
    installed: true,
  },
  {
    launcher: "steam",
    externalId: "550",
    name: "Left 4 Dead 2",
    installed: true,
  },
  {
    launcher: "steam",
    externalId: "105600",
    name: "Terraria",
    installed: false,
  },
  {
    launcher: "steam",
    externalId: "413150",
    name: "Stardew Valley",
    installed: true,
  },
  {
    launcher: "steam",
    externalId: "945360",
    name: "Among Us",
    installed: true,
  },
  {
    launcher: "steam",
    externalId: "892970",
    name: "Valheim",
    installed: false,
  },
  {
    launcher: "steam",
    externalId: "548430",
    name: "Deep Rock Galactic",
    installed: true,
  },
  {
    launcher: "steam",
    externalId: "632360",
    name: "Risk of Rain 2",
    installed: false,
  },
  {
    launcher: "steam",
    externalId: "620",
    name: "Portal 2",
    installed: true,
  },
  {
    launcher: "steam",
    externalId: "4000",
    name: "Garry's Mod",
    installed: true,
  },
  {
    launcher: "steam",
    externalId: "322330",
    name: "Don't Starve Together",
    installed: false,
  },
  {
    launcher: "steam",
    externalId: "582010",
    name: "Monster Hunter: World",
    installed: false,
  },
  {
    launcher: "steam",
    externalId: "230410",
    name: "Warframe",
    installed: true,
  },
  {
    launcher: "steam",
    externalId: "1172470",
    name: "Apex Legends",
    installed: true,
  },
  {
    launcher: "steam",
    externalId: "252950",
    name: "Rocket League",
    installed: false,
  },
  {
    launcher: "steam",
    externalId: "289070",
    name: "Sid Meier's Civilization VI",
    installed: false,
  },
  {
    launcher: "steam",
    externalId: "1086940",
    name: "Baldur's Gate 3",
    installed: true,
  },
  {
    launcher: "steam",
    externalId: "553850",
    name: "HELLDIVERS 2",
    installed: false,
  },
  {
    launcher: "steam",
    externalId: "1966720",
    name: "Lethal Company",
    installed: true,
  },
  {
    launcher: "steam",
    externalId: "739630",
    name: "Phasmophobia",
    installed: false,
  },
  {
    launcher: "steam",
    externalId: "477160",
    name: "Human Fall Flat",
    installed: true,
  },
  {
    launcher: "steam",
    externalId: "285900",
    name: "Gang Beasts",
    installed: false,
  },
  {
    launcher: "steam",
    externalId: "242760",
    name: "The Forest",
    installed: true,
  },
  {
    launcher: "steam",
    externalId: "1172620",
    name: "Sea of Thieves",
    installed: false,
  },
  {
    launcher: "steam",
    externalId: "286160",
    name: "Tabletop Simulator",
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

  const steamModes = await fetchSteamGroupPlayable(
    SAMPLE_GAMES.filter((game) => game.launcher === "steam").map(
      (game) => game.externalId,
    ),
  );
  for (const game of SAMPLE_GAMES) {
    if (game.launcher !== "steam") continue;
    const groupPlayable = steamModes.get(game.externalId);
    if (groupPlayable == null) continue;
    await db.pool.query(
      `
        INSERT INTO game_meta (
          launcher, external_id, name, group_playable,
          group_playable_source, fetched_at
        )
        VALUES ('steam', $1, $2, $3, 'steam_store', now())
        ON CONFLICT (launcher, external_id) DO UPDATE SET
          group_playable = EXCLUDED.group_playable,
          group_playable_source = EXCLUDED.group_playable_source,
          fetched_at = now()
      `,
      [game.externalId, game.name, groupPlayable],
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
