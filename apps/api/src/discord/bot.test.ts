import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseDiscordChannelId } from "./bot.js";
import { formatDiscordNotice } from "./messages.js";

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
      "LOBBY\nLes Copains\nSoirée ouverte · 05 joueurs",
    );
  });

  it("formats the chosen game", () => {
    assert.equal(
      formatDiscordNotice("Les Copains", { kind: "chosen", gameName: "Hades" }),
      "ON JOUE ÇA\nHades\nLes Copains",
    );
  });
});
