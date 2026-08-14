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
    });
    assert.equal(payload.embeds[0]?.title, "Lobby");
    assert.equal(payload.embeds[0]?.description, "Les Copains");
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
    assert.match(payload.content, /Proposition/);
  });
});
