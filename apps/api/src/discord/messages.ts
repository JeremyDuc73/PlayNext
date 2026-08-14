import { formatParisWhen } from "../time/paris.js";

export type DiscordNotice =
  | {
      kind: "lobby";
      playerCount: number;
      scheduledAt?: string | Date | null;
      gameName?: string | null;
      steamUrl?: string | null;
      coverUrl?: string | null;
    }
  | { kind: "chosen"; gameName: string; coverUrl?: string | null }
  | {
      kind: "proposal";
      gameName: string;
      steamUrl: string;
      priceLabel?: string | null;
      ownedCount: number;
      memberCount: number;
      missingNames: string[];
      coverUrl?: string | null;
    };

const PLAYNEXT_RED = 0xe2402c;

function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

export type DiscordEmbed = {
  title: string;
  url?: string;
  description?: string;
  color: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  image?: { url: string };
  footer?: { text: string };
  timestamp?: string;
};

export type DiscordMessagePayload = {
  content: string;
  embeds: DiscordEmbed[];
  allowed_mentions: { parse: [] };
  components?: Array<{
    type: 1;
    components: Array<{
      type: 2;
      style: 5;
      label: string;
      url: string;
    }>;
  }>;
};

export function formatDiscordNotice(
  groupName: string,
  notice: DiscordNotice,
): string {
  if (notice.kind === "lobby") {
    const when = notice.scheduledAt
      ? formatParisWhen(notice.scheduledAt)
      : null;
    const game = notice.gameName?.trim();
    const parts = ["Lobby ouvert", game, groupName, when].filter(Boolean);
    return parts.join(" · ");
  }
  if (notice.kind === "proposal") {
    return `Proposition · ${notice.gameName}`;
  }
  return `Jeu choisi · ${notice.gameName}`;
}

export function buildDiscordMessage(
  groupName: string,
  notice: DiscordNotice,
): DiscordMessagePayload {
  const timestamp = new Date().toISOString();
  if (notice.kind === "lobby") {
    const when = notice.scheduledAt
      ? formatParisWhen(notice.scheduledAt)
      : null;
    const fields: DiscordEmbed["fields"] = [
      {
        name: "Joueurs",
        value: `\`${pad2(notice.playerCount)}\``,
        inline: true,
      },
      {
        name: "Statut",
        value: "Soirée ouverte",
        inline: true,
      },
    ];
    if (when) {
      fields.push({
        name: "Horaire",
        value: when,
        inline: false,
      });
    }
    if (notice.gameName) {
      fields.push({
        name: "Jeu",
        value: notice.gameName,
        inline: false,
      });
    }
    const embed: DiscordEmbed = {
      title: "Lobby",
      description: groupName,
      color: PLAYNEXT_RED,
      fields,
      footer: { text: "PlayNext" },
      timestamp,
    };
    if (notice.coverUrl) {
      embed.image = { url: notice.coverUrl };
    }
    const payload: DiscordMessagePayload = {
      content: formatDiscordNotice(groupName, notice),
      allowed_mentions: { parse: [] },
      embeds: [embed],
    };
    if (notice.steamUrl) {
      payload.components = [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 5,
              label: "Store Steam",
              url: notice.steamUrl,
            },
          ],
        },
      ];
    }
    return payload;
  }

  if (notice.kind === "proposal") {
    const missing =
      notice.missingNames.length > 0
        ? notice.missingNames.join(" · ").slice(0, 1024)
        : "—";
    const embed: DiscordEmbed = {
      title: notice.gameName,
      url: notice.steamUrl,
      description: groupName,
      color: PLAYNEXT_RED,
      fields: [
        {
          name: "Prix",
          value: notice.priceLabel?.trim() || "—",
          inline: true,
        },
        {
          name: "Possèdent",
          value: `\`${pad2(notice.ownedCount)} / ${pad2(notice.memberCount)}\``,
          inline: true,
        },
        {
          name: "Sans le jeu",
          value: missing,
          inline: false,
        },
      ],
      footer: { text: "PlayNext" },
      timestamp,
    };
    if (notice.coverUrl) {
      embed.image = { url: notice.coverUrl };
    }
    return {
      content: formatDiscordNotice(groupName, notice),
      allowed_mentions: { parse: [] },
      embeds: [embed],
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 5,
              label: "Store Steam",
              url: notice.steamUrl,
            },
          ],
        },
      ],
    };
  }

  const embed: DiscordEmbed = {
    title: notice.gameName,
    description: `Jeu choisi · ${groupName}`,
    color: PLAYNEXT_RED,
    footer: { text: "PlayNext" },
    timestamp,
  };
  if (notice.coverUrl) {
    embed.image = { url: notice.coverUrl };
  }

  return {
    content: formatDiscordNotice(groupName, notice),
    allowed_mentions: { parse: [] },
    embeds: [embed],
  };
}
