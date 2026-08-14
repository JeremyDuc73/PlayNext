import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  groupPlayableFromSteamCategories,
  shouldStopSteamEnrichment,
  steamTitleSearchWrite,
} from "./store.js";

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

describe("shouldStopSteamEnrichment", () => {
  it("stops on 429 or 403", () => {
    assert.equal(
      shouldStopSteamEnrichment({ consecutiveRetries: 1, httpStatus: 429 }),
      true,
    );
    assert.equal(
      shouldStopSteamEnrichment({ consecutiveRetries: 1, httpStatus: 403 }),
      true,
    );
  });

  it("stops after three consecutive retries", () => {
    assert.equal(
      shouldStopSteamEnrichment({ consecutiveRetries: 2 }),
      false,
    );
    assert.equal(
      shouldStopSteamEnrichment({ consecutiveRetries: 3 }),
      true,
    );
  });
});

describe("steamTitleSearchWrite", () => {
  it("does not persist a failed or rate-limited search", () => {
    assert.deepEqual(
      steamTitleSearchWrite({ status: "retry" }, null),
      { write: false },
    );
  });

  it("persists a store miss only after a successful search", () => {
    assert.deepEqual(steamTitleSearchWrite({ status: "miss" }, null), {
      write: true,
      playable: null,
      source: "steam_store_search_miss",
    });
  });

  it("does not persist a matched title when appdetails must be retried", () => {
    assert.deepEqual(
      steamTitleSearchWrite(
        { status: "match", appId: "123" },
        { status: "retry", httpStatus: 429 },
      ),
      { write: false },
    );
  });

  it("persists a classified match", () => {
    assert.deepEqual(
      steamTitleSearchWrite(
        { status: "match", appId: "123" },
        { status: "classified", playable: true },
      ),
      {
        write: true,
        playable: true,
        source: "steam_store_search",
      },
    );
    });
});
