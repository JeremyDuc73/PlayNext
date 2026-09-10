import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseDiscordChannelId } from "./bot.js";
import { buildDiscordMessage, formatDiscordNotice } from "./messages.js";

describe("parseDiscordChannelId", () => {
  it("accepts a snowflake", () => {
    assert.equal(parseDiscordChannelId("123456789012345678"), "123456789012345678");
  });

  it("extracts the id from a channel URL", () => {
    assert.equal(
      parseDiscordChannelId(
        "https://discord.com/channels/111111111111111111/222222222222222222",
      ),
      "222222222222222222",
    );
  });

  it("rejects junk", () => {
    assert.equal(parseDiscordChannelId("general"), null);
    assert.equal(parseDiscordChannelId(""), null);
  });
});

describe("formatDiscordNotice", () => {
  it("formats a lobby opening", () => {
    assert.equal(
      formatDiscordNotice("Les Copains", { kind: "lobby", playerCount: 5 }),
      "Lobby ouvert · Les Copains",
    );
  });

  it("formats the chosen game", () => {
    assert.equal(
      formatDiscordNotice("Les Copains", { kind: "chosen", gameName: "Hades" }),
      "Jeu choisi · Hades",
    );
  });

  it("formats a Steam proposal", () => {
    assert.equal(
      formatDiscordNotice("Les Copains", {
        kind: "proposal",
        gameName: "Hades",
        steamUrl: "https://store.steampowered.com/app/1145360/",
        ownedCount: 2,
        memberCount: 5,
        missingNames: ["Ada", "Bob"],
      }),
      "Proposition · Hades",
    );
  });
});

describe("buildDiscordMessage", () => {
  it("uses a lobby embed", () => {
    const payload = buildDiscordMessage("Les Copains", {
      kind: "lobby",
      playerCount: 5,
      scheduledAt: "2026-08-14T19:00:00.000Z",
    });
    assert.equal(payload.embeds[0]?.title, "SOIRÉE JEU EN VUE !");
    assert.match(payload.embeds[0]?.description ?? "", /Les Copains/);
    assert.match(payload.content, /Lobby ouvert/);
    assert.match(payload.content, /21:00/);
  });

  it("puts the cover on the chosen-game embed", () => {
    const payload = buildDiscordMessage("Les Copains", {
      kind: "chosen",
      gameName: "Hades",
      coverUrl: "https://example.com/hades.jpg",
    });
    assert.equal(payload.embeds[0]?.title, "Hades");
    assert.equal(payload.embeds[0]?.image?.url, "https://example.com/hades.jpg");
    assert.match(payload.content, /Jeu choisi/);
  });

  it("puts the Steam store on a proposal embed", () => {
    const payload = buildDiscordMessage("Les Copains", {
      kind: "proposal",
      gameName: "Hades",
      steamUrl: "https://store.steampowered.com/app/1145360/",
      ownedCount: 2,
      memberCount: 5,
      missingNames: ["Ada", "Bob"],
      coverUrl: "https://example.com/hades.jpg",
    });
    assert.equal(payload.embeds[0]?.title, "Hades");
    assert.equal(
      payload.embeds[0]?.url,
      "https://store.steampowered.com/app/1145360/",
    );
    assert.equal(
      payload.components?.[0]?.components[0]?.url,
      "https://store.steampowered.com/app/1145360/",
    );
    assert.equal(
      payload.embeds[0]?.fields?.some((field) => field.name === "Prix"),
      true,
    );
  });

  it("builds a linked channel welcome embed", () => {
    const payload = buildDiscordMessage("Les Copains", {
      kind: "linked",
      guildName: "Serveur Discord",
      channelName: "annonces-jeux",
    });
    assert.match(payload.embeds[0]?.title ?? "", /LE BOT PLAYNEXT EST PRÊT !/);
    assert.match(payload.embeds[0]?.description ?? "", /#annonces-jeux/);
    assert.equal(payload.components?.[0]?.components[0]?.label, "Télécharger PlayNext ↗");
  });

  it("builds a voting notice embed with candidates", () => {
    const payload = buildDiscordMessage("Les Copains", {
      kind: "voting",
      playerCount: 4,
      candidateCount: 3,
      candidateNames: ["Deep Rock Galactic", "Valheim", "Terraria"],
    });
    assert.match(payload.embeds[0]?.title ?? "", /C’EST L’HEURE DE VOTER !/);
    assert.match(payload.content, /Vote ouvert/);
    assert.equal(
      payload.embeds[0]?.fields?.some((f) => f.name === "Jeux en lice"),
      true,
    );
  });

  it("builds an approved proposal embed", () => {
    const payload = buildDiscordMessage("Les Copains", {
      kind: "proposal_approved",
      gameName: "Abiotic Factor",
      steamUrl: "https://store.steampowered.com/app/427410/",
      memberCount: 4,
      priceLabel: "24,99 €",
    });
    assert.match(payload.embeds[0]?.title ?? "", /TOUT LE MONDE EST CHAUD POUR ABIOTIC FACTOR !/);
    assert.match(payload.content, /Proposition validée/);
  });

  it("includes votes tally and relative timestamp in chosen notice", () => {
    const payload = buildDiscordMessage("Les Copains", {
      kind: "chosen",
      gameName: "Abiotic Factor",
      scheduledAt: "2026-09-10T19:00:00.000Z",
      eveningKind: "ritual",
      hotVotes: 3,
      maybeVotes: 1,
      playerCount: 4,
      usedRoulette: true,
      coverUrl: "https://example.com/cover.jpg",
      steamUrl: "https://store.steampowered.com/app/427410/",
    });
    assert.equal(payload.embeds[0]?.title, "Abiotic Factor");
    assert.equal(payload.embeds[0]?.image?.url, "https://example.com/cover.jpg");
    assert.equal(
      payload.embeds[0]?.fields?.some((f) => f.name === "Les votes"),
      true,
    );
    assert.equal(
      payload.embeds[0]?.fields?.some((f) => f.name === "Égalité départagée"),
      true,
    );
    assert.equal(payload.components?.[0]?.components[0]?.url, "https://store.steampowered.com/app/427410/");
  });
});
