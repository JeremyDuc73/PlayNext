export type DiscordNotice =
  | { kind: "lobby"; playerCount: number }
  | { kind: "chosen"; gameName: string; coverUrl?: string | null };

const PLAYNEXT_RED = 0xe2402c;

function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

export type DiscordEmbed = {
  title: string;
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
};

export function formatDiscordNotice(
  groupName: string,
  notice: DiscordNotice,
): string {
  if (notice.kind === "lobby") {
    return `Lobby ouvert · ${groupName}`;
  }
  return `Jeu choisi · ${notice.gameName}`;
}

export function buildDiscordMessage(
  groupName: string,
  notice: DiscordNotice,
): DiscordMessagePayload {
  const timestamp = new Date().toISOString();
  if (notice.kind === "lobby") {
    return {
      content: formatDiscordNotice(groupName, notice),
      allowed_mentions: { parse: [] },
      embeds: [
        {
          title: "Lobby",
          description: groupName,
          color: PLAYNEXT_RED,
          fields: [
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
          ],
          footer: { text: "PlayNext" },
          timestamp,
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
