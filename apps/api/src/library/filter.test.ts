import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  catalogSearchTerm,
  dedupePreferLaunchers,
  groupPlayableFromIgdbModes,
  groupPlayableOverride,
  isJunkGameName,
  isVisibleInGroup,
  normalizeGameTitle,
  pickCatalogMatch,
  resolveGroupPlayable,
  titlesMatchForCatalog,
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
    assert.equal(isJunkGameName("Epic Games Launcher"), true);
    assert.equal(isJunkGameName("Minecraft for Windows"), true);
    assert.equal(isJunkGameName("Minecraft for Windows 10"), true);
    assert.equal(isJunkGameName("SUPER PEOPLE Testing Grounds"), true);
    assert.equal(isJunkGameName("Snap Attack"), true);
    assert.equal(isJunkGameName("Knockout City™ Cross-Play Beta"), true);
    assert.equal(isJunkGameName("Tiny Troopers 2: Special Ops"), true);
    assert.equal(isJunkGameName("Trackmania Starter Access"), true);
    assert.equal(isJunkGameName("Dragon Mania Legends"), true);
  });

  it("keeps normal titles", () => {
    assert.equal(isJunkGameName("Democracy 4"), false);
    assert.equal(isJunkGameName("Hades"), false);
    assert.equal(isJunkGameName("Modern Warfare"), false);
    assert.equal(isJunkGameName("SteamWorld Dig"), false);
    assert.equal(isJunkGameName("League of Legends"), false);
    assert.equal(isJunkGameName("VALORANT"), false);
    assert.equal(isJunkGameName("Minecraft"), false);
    assert.equal(isJunkGameName("Minecraft Launcher"), false);
    assert.equal(isJunkGameName("Minecraft Dungeons"), false);
    assert.equal(isJunkGameName("Knockout City"), false);
    assert.equal(isJunkGameName("Trackmania"), false);
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
    assert.equal(groupPlayableOverride("MONOPOLY POKER"), true);
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

describe("normalizeGameTitle", () => {
  it("strips Xbox/Epic store noise", () => {
    assert.equal(
      normalizeGameTitle("DOOM ETERNAL (BATTLEMODE - PC)"),
      "doom eternal",
    );
    assert.equal(
      normalizeGameTitle("HARDSPACE: SHIPBREAKER - WINDOWS"),
      "hardspace shipbreaker",
    );
    assert.equal(
      normalizeGameTitle("HEROES OF MIGHT AND MAGIC: OLDEN ERA (GAME PREVIEW)"),
      "heroes of might and magic olden era",
    );
    assert.equal(normalizeGameTitle("KILLINGFLOOR2BETA"), "killingfloor2");
    assert.equal(normalizeGameTitle("ROCKET LEAGUE®"), "rocket league");
    assert.equal(
      normalizeGameTitle("STAR WARS™ BATTLEFRONT™ II: CELEBRATION EDITION"),
      "star wars battlefront ii",
    );
    assert.equal(normalizeGameTitle("SNOWRUNNER - WINDOWS"), "snowrunner");
    assert.equal(
      normalizeGameTitle("LIGHTYEAR FRONTIER (GAME PREVIEW)"),
      "lightyear frontier",
    );
    assert.equal(normalizeGameTitle("Minecraft Launcher"), "minecraft");
    assert.equal(
      normalizeGameTitle(
        "CALL OF DUTY: MODERN WARFARE - DIGITAL STANDARD EDITION",
      ),
      "call of duty modern warfare",
    );
  });
});

describe("catalogSearchTerm", () => {
  it("drops Windows tails but keeps real subtitles", () => {
    assert.equal(
      catalogSearchTerm("HARDSPACE: SHIPBREAKER - WINDOWS"),
      "hardspace shipbreaker",
    );
    assert.equal(
      catalogSearchTerm("HUNDRED DAYS - WINEMAKING SIMULATOR"),
      "hundred days winemaking simulator",
    );
    assert.equal(
      catalogSearchTerm("DOOM ETERNAL (BATTLEMODE - PC)"),
      "doom eternal",
    );
    assert.equal(
      catalogSearchTerm(
        "CALL OF DUTY: MODERN WARFARE - DIGITAL STANDARD EDITION",
      ),
      "call of duty modern warfare",
    );
  });
});

describe("titlesMatchForCatalog", () => {
  it("matches glued names and store suffixes", () => {
    assert.equal(
      titlesMatchForCatalog("KILLINGFLOOR2BETA", "Killing Floor 2"),
      true,
    );
    assert.equal(
      titlesMatchForCatalog("DOOM ETERNAL (BATTLEMODE - PC)", "DOOM Eternal"),
      true,
    );
    assert.equal(
      titlesMatchForCatalog("ROCKET LEAGUE®", "Rocket League"),
      true,
    );
    assert.equal(
      titlesMatchForCatalog("Minecraft Launcher", "Minecraft"),
      true,
    );
    assert.equal(
      titlesMatchForCatalog(
        "CALL OF DUTY: MODERN WARFARE - DIGITAL STANDARD EDITION",
        "Call of Duty®: Modern Warfare®",
      ),
      true,
    );
  });

  it("does not match a franchise prefix to a sequel", () => {
    assert.equal(
      titlesMatchForCatalog("Call of Duty: Black Ops 6", "Call of Duty"),
      false,
    );
    assert.equal(titlesMatchForCatalog("Killing Floor 2", "Killing Floor"), false);
  });

  it("prefers an exact catalogue hit over a prefix", () => {
    const hit = pickCatalogMatch(
      "Heroes of Might and Magic: Olden Era",
      [
        { name: "Heroes of Might and Magic 3" },
        { name: "Heroes of Might and Magic: Olden Era" },
      ],
      (row) => row.name,
    );
    assert.equal(hit?.name, "Heroes of Might and Magic: Olden Era");
  });
});
