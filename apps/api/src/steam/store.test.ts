import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  gamesSharingNormalizedTitle,
  groupPlayableFromSteamCategories,
  groupPlayableKind,
  isGroupPlayableQueued,
  shouldStopSteamEnrichment,
  steamTitleSearchWrite,
  takeRoundRobin,
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
    assert.equal(shouldStopSteamEnrichment({ httpStatus: 429 }), true);
    assert.equal(shouldStopSteamEnrichment({ httpStatus: 403 }), true);
  });

  it("does not stop on a single unavailable app", () => {
    assert.equal(shouldStopSteamEnrichment({ httpStatus: 200 }), false);
    assert.equal(shouldStopSteamEnrichment({}), false);
  });
});

describe("isGroupPlayableQueued", () => {
  it("keeps store misses in the queue for IGDB", () => {
    assert.equal(
      isGroupPlayableQueued({
        launcher: "xbox",
        groupPlayable: null,
        source: "steam_store_search_miss",
      }),
      true,
    );
  });

  it("drops titles already settled by IGDB", () => {
    assert.equal(
      isGroupPlayableQueued({
        launcher: "xbox",
        groupPlayable: null,
        source: "igdb_miss",
      }),
      false,
    );
  });

  it("treats a store miss as settled when IGDB is off", () => {
    assert.equal(
      isGroupPlayableQueued({
        launcher: "xbox",
        groupPlayable: null,
        source: "steam_store_search_miss",
        igdbConfigured: false,
      }),
      false,
    );
  });
});

describe("groupPlayableKind", () => {
  it("splits classified, pending, and catalogue misses", () => {
    assert.equal(
      groupPlayableKind({
        launcher: "steam",
        groupPlayable: true,
        source: "steam_store",
      }),
      "multi",
    );
    assert.equal(
      groupPlayableKind({
        launcher: "steam",
        groupPlayable: null,
        source: null,
      }),
      "pending",
    );
    assert.equal(
      groupPlayableKind({
        launcher: "xbox",
        groupPlayable: null,
        source: "igdb_miss",
      }),
      "unknown",
    );
  });
});

describe("gamesSharingNormalizedTitle", () => {
  it("keeps every launcher copy of the same title", () => {
    const games = [
      { launcher: "xbox", name: "Hades" },
      { launcher: "epic", name: "Hades" },
      { launcher: "steam", name: "Celeste" },
    ];
    assert.deepEqual(
      gamesSharingNormalizedTitle(games, "HADES"),
      [
        { launcher: "xbox", name: "Hades" },
        { launcher: "epic", name: "Hades" },
      ],
    );
  });
});

describe("takeRoundRobin", () => {
  it("advances past the head of the list", () => {
    assert.deepEqual(takeRoundRobin(["a", "b", "c", "d"], 2, 2), {
      slice: ["c", "d"],
      nextOffset: 4,
    });
    assert.deepEqual(takeRoundRobin(["a", "b", "c", "d"], 3, 2), {
      slice: ["d", "a"],
      nextOffset: 5,
    });
  });
});

describe("steamTitleSearchWrite", () => {
  it("does not persist a failed or rate-limited search", () => {
    assert.deepEqual(steamTitleSearchWrite({ status: "retry" }, null), {
      write: false,
    });
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

  it("persists an unavailable matched app so the queue can move", () => {
    assert.deepEqual(
      steamTitleSearchWrite(
        { status: "match", appId: "123" },
        { status: "retry", httpStatus: 200 },
      ),
      {
        write: true,
        playable: null,
        source: "steam_store_search",
      },
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
