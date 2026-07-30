import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dedupePreferLaunchers,
  isJunkGameName,
  normalizeGameTitle,
} from "./filter.js";

describe("isJunkGameName", () => {
  it("flags playtest demo modkit", () => {
    assert.equal(isJunkGameName("Game Playtest"), true);
    assert.equal(isJunkGameName("Cool Demo"), true);
    assert.equal(isJunkGameName("Editor ModKit"), true);
    assert.equal(isJunkGameName("Something (Demo)"), true);
  });

  it("keeps normal titles", () => {
    assert.equal(isJunkGameName("Democracy 4"), false);
    assert.equal(isJunkGameName("Hades"), false);
    assert.equal(isJunkGameName("Modern Warfare"), false);
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
