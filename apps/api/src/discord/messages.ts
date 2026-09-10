import { formatParisWhen } from "../time/paris.js";

export type DiscordNotice =
  | {
      kind: "linked";
      guildName?: string | null;
      channelName?: string | null;
    }
  | {
      kind: "lobby";
      playerCount: number;
      scheduledAt?: string | Date | null;
      gameName?: string | null;
      steamUrl?: string | null;
      coverUrl?: string | null;
      eveningKind?: "ritual" | "direct";
      title?: string | null;
      vibe?: string | null;
      durationMinutes?: number | null;
    }
  | {
      kind: "voting";
      playerCount: number;
      candidateCount: number;
      candidateNames?: string[];
    }
  | {
      kind: "chosen";
      gameName: string;
      coverUrl?: string | null;
      scheduledAt?: string | Date | null;
      steamUrl?: string | null;
      eveningKind?: "ritual" | "direct";
      hotVotes?: number;
      maybeVotes?: number;
      playerCount?: number;
      usedRoulette?: boolean;
    }
  | {
      kind: "proposal";
      gameName: string;
      steamUrl: string;
      priceLabel?: string | null;
      ownedCount: number;
      memberCount: number;
      missingNames: string[];
      coverUrl?: string | null;
      proposerName?: string | null;
    }
  | {
      kind: "proposal_approved";
      gameName: string;
      steamUrl: string;
      priceLabel?: string | null;
      memberCount: number;
      coverUrl?: string | null;
    };

const PLAYNEXT_VERMILLON = 0xe2402c;

function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

function toDiscordTimestamp(
  value: string | Date | null | undefined,
): { full: string; relative: string } | null {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  const unix = Math.floor(date.getTime() / 1000);
  return {
    full: `<t:${unix}:F>`,
    relative: `<t:${unix}:R>`,
  };
}

function formatVibe(vibe: string | null | undefined): string {
  switch (vibe) {
    case "chill":
      return "Détente";
    case "competitive":
      return "Compétitif";
    case "campaign":
      return "Campagne";
    case "party":
      return "Groupe";
    case "any":
      return "Libre";
    default:
      return "Libre";
  }
}

export type DiscordEmbed = {
  title: string;
  url?: string;
  description?: string;
  color: number;
  author?: {
    name: string;
    icon_url?: string;
    url?: string;
  };
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  thumbnail?: { url: string };
  image?: { url: string };
  footer?: { text: string; icon_url?: string };
  timestamp?: string;
};

export type DiscordButton = {
  type: 2;
  style: 5;
  label: string;
  url: string;
};

export type DiscordMessagePayload = {
  content: string;
  embeds: DiscordEmbed[];
  allowed_mentions: { parse: [] };
  components?: Array<{
    type: 1;
    components: DiscordButton[];
  }>;
};

export function formatDiscordNotice(
  groupName: string,
  notice: DiscordNotice,
): string {
  if (notice.kind === "linked") {
    return `Salon lié · ${groupName}`;
  }
  if (notice.kind === "lobby") {
    const when = notice.scheduledAt
      ? formatParisWhen(notice.scheduledAt)
      : null;
    const game = notice.gameName?.trim();
    const parts = ["Lobby ouvert", game, groupName, when].filter(Boolean);
    return parts.join(" · ");
  }
  if (notice.kind === "voting") {
    return `Vote ouvert · ${groupName} · ${pad2(notice.candidateCount)} jeux en lice`;
  }
  if (notice.kind === "proposal") {
    return `Proposition · ${notice.gameName}`;
  }
  if (notice.kind === "proposal_approved") {
    return `Proposition validée · ${notice.gameName}`;
  }
  return `Jeu choisi · ${notice.gameName}`;
}

export function buildDiscordMessage(
  groupName: string,
  notice: DiscordNotice,
  webUrl: string = "https://playnext.jeremyduc.dev",
): DiscordMessagePayload {
  const timestamp = new Date().toISOString();
  const brandIcon = `${webUrl.replace(/\/+$/, "")}/playnext.svg`;
  const defaultFooter = {
    text: "PlayNext · Ce soir, on décide.",
    icon_url: brandIcon,
  };
  const author = {
    name: `PLAYNEXT · ${groupName.toUpperCase()}`,
    icon_url: brandIcon,
    url: webUrl,
  };

  // 1. SALON LIÉ
  if (notice.kind === "linked") {
    const embed: DiscordEmbed = {
      title: "SALON D’ANNONCES LIÉ",
      description: `Le salon **#${notice.channelName ?? "général"}** recevra désormais les annonces officielles du groupe **${groupName}**.\n\n*« Ce soir, on décide. »*`,
      color: PLAYNEXT_VERMILLON,
      author,
      fields: [
        {
          name: "Fonctionnalités actives",
          value:
            "• **Lobby ouvert** : annonce des sessions & horaires\n• **Dépouillement** : début des votes secrets\n• **Proclamation** : jaquette et résultat final\n• **Propositions** : sondages d'achats Steam",
          inline: false,
        },
        {
          name: "Comment participer ?",
          value:
            "Installez l'application PlayNext, connectez-vous avec Discord et rejoignez le groupe via votre code d'accès.",
          inline: false,
        },
      ],
      footer: defaultFooter,
      timestamp,
    };

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
              label: "Télécharger PlayNext ↗",
              url: `${webUrl}/download`,
            },
          ],
        },
      ],
    };
  }

  // 2. LOBBY OUVERT
  if (notice.kind === "lobby") {
    const direct = notice.eveningKind === "direct" || Boolean(notice.gameName);
    const ts = toDiscordTimestamp(notice.scheduledAt);
    const fields: DiscordEmbed["fields"] = [
      {
        name: "Format",
        value: direct ? "`⚡ Soirée directe`" : "`🎲 Rituel de vote`",
        inline: true,
      },
      {
        name: "Présence requise",
        value: `\`${pad2(notice.playerCount)}\` participants`,
        inline: true,
      },
    ];

    if (ts) {
      fields.push({
        name: "Horaire de session",
        value: `${ts.full}\n> ⏳ ${ts.relative}`,
        inline: false,
      });
    }

    if (!direct) {
      if (notice.vibe) {
        fields.push({
          name: "Ambiance",
          value: formatVibe(notice.vibe),
          inline: true,
        });
      }
      if (notice.durationMinutes != null) {
        fields.push({
          name: "Durée",
          value: `${notice.durationMinutes} min`,
          inline: true,
        });
      }
    } else if (notice.gameName) {
      fields.push({
        name: "Jeu au programme",
        value: `**${notice.gameName}**`,
        inline: false,
      });
    }

    fields.push({
      name: "Consigne",
      value: "Rejoignez le lobby dans PlayNext et confirmez votre présence pour participer.",
      inline: false,
    });

    const embed: DiscordEmbed = {
      title: notice.gameName ? `Soirée · ${notice.gameName}` : "Lobby",
      description: groupName,
      color: PLAYNEXT_VERMILLON,
      author,
      fields,
      footer: defaultFooter,
      timestamp,
    };

    if (notice.coverUrl) {
      if (direct) {
        embed.thumbnail = { url: notice.coverUrl };
      } else {
        embed.image = { url: notice.coverUrl };
      }
    }

    const buttons: DiscordButton[] = [];
    if (notice.steamUrl) {
      buttons.push({
        type: 2,
        style: 5,
        label: "Store Steam ↗",
        url: notice.steamUrl,
      });
    }
    buttons.push({
      type: 2,
      style: 5,
      label: "Ouvrir PlayNext ↗",
      url: webUrl,
    });

    return {
      content: formatDiscordNotice(groupName, notice),
      allowed_mentions: { parse: [] },
      embeds: [embed],
      components: buttons.length > 0 ? [{ type: 1, components: buttons }] : undefined,
    };
  }

  // 3. VOTE EN COURS
  if (notice.kind === "voting") {
    const fields: DiscordEmbed["fields"] = [
      {
        name: "Sélection retenue",
        value: `\`${pad2(notice.candidateCount)}\` jeux en lice`,
        inline: true,
      },
      {
        name: "Votants",
        value: `\`${pad2(notice.playerCount)}\` joueurs`,
        inline: true,
      },
      {
        name: "Règles du rituel",
        value:
          "• **1 veto par joueur** : éliminatoire d’office\n• **Bulletins simultanés** : Chaud / Pourquoi pas / Pass\n• **Dépouillement automatique** dès le dernier bulletin déposé",
        inline: false,
      },
    ];

    if (notice.candidateNames && notice.candidateNames.length > 0) {
      fields.push({
        name: "Jeux soumis au vote",
        value: notice.candidateNames
          .slice(0, 10)
          .map((n, i) => `\`${pad2(i + 1)}\` ${n}`)
          .join("\n"),
        inline: false,
      });
    }

    const embed: DiscordEmbed = {
      title: "LE VOTE EST OUVERT",
      description: `Toutes les sélections ont été déposées pour le groupe **${groupName}**. Rendez-vous dans l'application pour déposer vos bulletins !`,
      color: PLAYNEXT_VERMILLON,
      author,
      fields,
      footer: defaultFooter,
      timestamp,
    };

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
              label: "Voter dans PlayNext ↗",
              url: webUrl,
            },
          ],
        },
      ],
    };
  }

  // 4. PROPOSITION DE JEU
  if (notice.kind === "proposal") {
    const missing =
      notice.missingNames.length > 0
        ? notice.missingNames.join(" · ").slice(0, 1024)
        : "Tout le monde possède le jeu !";

    const fields: DiscordEmbed["fields"] = [
      {
        name: "Prix",
        value: `\`${notice.priceLabel?.trim() || "Steam"}\``,
        inline: true,
      },
      {
        name: "Possession",
        value: `\`${pad2(notice.ownedCount)} / ${pad2(notice.memberCount)}\` membres`,
        inline: true,
      },
    ];

    if (notice.proposerName) {
      fields.push({
        name: "Proposé par",
        value: notice.proposerName,
        inline: true,
      });
    }

    fields.push(
      {
        name: "Sans le jeu",
        value: missing,
        inline: false,
      },
      {
        name: "Vote du groupe",
        value: "Votez **Chaud** ou **Non** dans PlayNext pour valider ou écarter cette proposition.",
        inline: false,
      },
    );

    const embed: DiscordEmbed = {
      title: notice.gameName,
      url: notice.steamUrl,
      description: groupName,
      color: PLAYNEXT_VERMILLON,
      author,
      fields,
      footer: defaultFooter,
      timestamp,
    };

    if (notice.coverUrl) {
      embed.thumbnail = { url: notice.coverUrl };
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
              label: "Store Steam ↗",
              url: notice.steamUrl,
            },
            {
              type: 2,
              style: 5,
              label: "Voter dans PlayNext ↗",
              url: webUrl,
            },
          ],
        },
      ],
    };
  }

  // 5. PROPOSITION VALIDÉE
  if (notice.kind === "proposal_approved") {
    const embed: DiscordEmbed = {
      title: `PROPOSITION VALIDÉE : ${notice.gameName.toUpperCase()}`,
      url: notice.steamUrl,
      description: `Tous les membres du groupe **${groupName}** sont chauds pour jouer à **${notice.gameName}** ! 🎉`,
      color: PLAYNEXT_VERMILLON,
      author,
      fields: [
        {
          name: "Prix Store",
          value: `\`${notice.priceLabel?.trim() || "Steam"}\``,
          inline: true,
        },
        {
          name: "Sondage",
          value: `\`${pad2(notice.memberCount)} / ${pad2(notice.memberCount)}\` Chauds ✅`,
          inline: true,
        },
        {
          name: "Prêt pour la soirée",
          value: "La proposition est validée. Le créateur peut lancer la soirée directe en un clic dans PlayNext.",
          inline: false,
        },
      ],
      footer: defaultFooter,
      timestamp,
    };

    if (notice.coverUrl) {
      embed.thumbnail = { url: notice.coverUrl };
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
              label: "Store Steam ↗",
              url: notice.steamUrl,
            },
            {
              type: 2,
              style: 5,
              label: "Lancer dans PlayNext ↗",
              url: webUrl,
            },
          ],
        },
      ],
    };
  }

  // 6. JEU CHOISI (RÉSULTAT OFFICIEL)
  const ts = toDiscordTimestamp(notice.scheduledAt);
  const fields: DiscordEmbed["fields"] = [];

  if (ts) {
    fields.push({
      name: "Horaire de session",
      value: `${ts.full}\n> ⏳ ${ts.relative}`,
      inline: false,
    });
  }

  if (notice.playerCount) {
    fields.push({
      name: "Participants",
      value: `\`${pad2(notice.playerCount)}\` joueurs confirmés`,
      inline: true,
    });
  }

  if (notice.eveningKind === "ritual" && (notice.hotVotes != null || notice.maybeVotes != null)) {
    fields.push({
      name: "Dépouillement",
      value: `🔥 \`${pad2(notice.hotVotes ?? 0)}\` Chaud · 👍 \`${pad2(notice.maybeVotes ?? 0)}\` Pourquoi pas`,
      inline: true,
    });
  } else if (notice.eveningKind === "direct") {
    fields.push({
      name: "Format",
      value: "⚡ Choix direct validé",
      inline: true,
    });
  }

  if (notice.usedRoulette) {
    fields.push({
      name: "Départage",
      value: "🎲 Roulette (tirage au sort sur égalité parfaite)",
      inline: false,
    });
  }

  const embed: DiscordEmbed = {
    title: notice.gameName,
    description: `Jeu retenu · ${groupName}`,
    color: PLAYNEXT_VERMILLON,
    author,
    fields: fields.length > 0 ? fields : undefined,
    footer: defaultFooter,
    timestamp,
  };

  if (notice.coverUrl) {
    embed.image = { url: notice.coverUrl };
  }

  const buttons: DiscordButton[] = [];
  if (notice.steamUrl) {
    buttons.push({
      type: 2,
      style: 5,
      label: "Store Steam ↗",
      url: notice.steamUrl,
    });
  }
  buttons.push({
    type: 2,
    style: 5,
    label: "Rejoindre sur PlayNext ↗",
    url: webUrl,
  });

  return {
    content: formatDiscordNotice(groupName, notice),
    allowed_mentions: { parse: [] },
    embeds: [embed],
    components: [{ type: 1, components: buttons }],
  };
}
