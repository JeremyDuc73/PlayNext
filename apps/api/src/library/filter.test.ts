import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dedupePreferLaunchers,
  groupPlayableFromIgdbModes,
  groupPlayableOverride,
  isJunkGameName,
  isVisibleInGroup,
  normalizeGameTitle,
  resolveGroupPlayable,
} from "./filter.js";

describe("isJunkGameName", () => {
  it("flags playtest demo modkit", () => {
    assert.equal(isJunkGameName("Game Playtest"), true);
    assert.equal(isJunkGameName("Cool Demo"), true);
    assert.equal(isJunkGameName("Editor ModKit"), true);
    assert.equal(isJunkGameName("Something (Demo)"), true);
  });

  it("flags tools and launchers", () => {
    assert.equal(isJunkGameName("SteamVR"), true);
    assert.equal(isJunkGameName("Steamworks Common Redistributables"), true);
    assert.equal(isJunkGameName("Wallpaper Engine"), true);
    assert.equal(isJunkGameName("3DMark"), true);
    assert.equal(isJunkGameName("Aim Lab"), true);
    assert.equal(isJunkGameName("Aimlabs"), true);
    assert.equal(isJunkGameName("Discord"), true);
    assert.equal(isJunkGameName("RPG Maker XP"), true);
  });

  it("keeps normal titles", () => {
    assert.equal(isJunkGameName("Democracy 4"), false);
    assert.equal(isJunkGameName("Hades"), false);
    assert.equal(isJunkGameName("Modern Warfare"), false);
    assert.equal(isJunkGameName("SteamWorld Dig"), false);
    assert.equal(isJunkGameName("League of Legends"), false);
    assert.equal(isJunkGameName("VALORANT"), false);
  });
});

describe("groupPlayableOverride", () => {
  it("keeps Elden Ring out of group evenings", () => {
    assert.equal(groupPlayableOverride("Elden Ring"), false);
    assert.equal(groupPlayableOverride("Overcooked 2"), null);
  });

  it("keeps Riot titles in groups", () => {
    assert.equal(groupPlayableOverride("League of Legends"), true);
    assert.equal(groupPlayableOverride("VALORANT"), true);
  });
});

describe("resolveGroupPlayable", () => {
  it("prefers title override over stored value", () => {
    assert.equal(
      resolveGroupPlayable({
        name: "Elden Ring",
        launcher: "steam",
        stored: true,
      }),
      false,
    );
  });

  it("uses a Steam classification of the same title", () => {
    assert.equal(
      resolveGroupPlayable({
        name: "Hades",
        launcher: "xbox",
        stored: null,
        byTitle: false,
      }),
      false,
    );
  });
});

describe("groupPlayableFromIgdbModes", () => {
  it("treats coop and multi as group playable", () => {
    assert.equal(groupPlayableFromIgdbModes([1, 3]), true);
    assert.equal(groupPlayableFromIgdbModes([2]), true);
  });

  it("treats single-player-only as solo", () => {
    assert.equal(groupPlayableFromIgdbModes([1]), false);
  });
});

describe("isVisibleInGroup", () => {
  it("hides known solo and keeps unknown", () => {
    assert.equal(isVisibleInGroup(false), false);
    assert.equal(isVisibleInGroup(true), true);
    assert.equal(isVisibleInGroup(null), true);
  });
});

describe("dedupePreferLaunchers", () => {
  it("keeps steam over xbox over epic", () => {
    const out = dedupePreferLaunchers([
      { name: "Hades", launcher: "epic", installed: true },
      { name: "Hades", launcher: "xbox", installed: false },
      { name: "Hades", launcher: "steam", installed: false },
      { name: "Celeste", launcher: "epic", installed: true },
    ]);
    assert.equal(out.length, 2);
    const hades = out.find((g) => normalizeGameTitle(g.name) === "hades");
    assert.equal(hades?.launcher, "steam");
  });

  it("matches across punctuation", () => {
    const out = dedupePreferLaunchers([
      { name: "Call of Duty®: Black Ops 6", launcher: "xbox" },
      { name: "Call of Duty: Black Ops 6", launcher: "steam" },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0]!.launcher, "steam");
  });
});
