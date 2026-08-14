import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupPlayableFromSteamCategories } from "./store.js";

describe("groupPlayableFromSteamCategories", () => {
  it("treats multiplayer and coop as group playable", () => {
    assert.equal(
      groupPlayableFromSteamCategories(["Multi-player", "Single-player"]),
      true,
    );
    assert.equal(groupPlayableFromSteamCategories(["Online Co-op"]), true);
  });

  it("treats single-player-only as solo", () => {
    assert.equal(groupPlayableFromSteamCategories(["Single-player"]), false);
  });

  it("returns unknown when modes are missing", () => {
    assert.equal(groupPlayableFromSteamCategories(["Steam Achievements"]), null);
  });
});
