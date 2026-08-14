import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildShortlist } from "./shortlist.js";
import {
  candidatesForNewRound,
  resolveWinner,
  talliesFromVotes,
} from "./scoring.js";
import type { LibraryGameAgg } from "./types.js";

function game(
  partial: Partial<LibraryGameAgg> & Pick<LibraryGameAgg, "name" | "externalId">,
): LibraryGameAgg {
  return {
    launcher: "steam",
    ownedCount: 2,
    installedCount: 2,
    participantCount: 2,
    ...partial,
  };
}

describe("buildShortlist", () => {
  it("keeps only games owned by all when required", () => {
    const list = buildShortlist(
      [
        game({ name: "A", externalId: "1", ownedCount: 2, installedCount: 1 }),
        game({ name: "B", externalId: "2", ownedCount: 1, installedCount: 1 }),
      ],
      { requireOwned: true, requireInstalled: false, shortlistSize: 8 },
    );
    assert.equal(list.length, 1);
    assert.equal(list[0]!.name, "A");
  });

  it("requires installed by all when asked", () => {
    const list = buildShortlist(
      [
        game({ name: "A", externalId: "1", installedCount: 2 }),
        game({ name: "B", externalId: "2", installedCount: 1 }),
      ],
      { requireOwned: true, requireInstalled: true, shortlistSize: 8 },
    );
    assert.equal(list.length, 1);
    assert.equal(list[0]!.externalId, "1");
  });

  it("excludes games not playable as a group", () => {
    const list = buildShortlist(
      [
        game({ name: "Elden Ring", externalId: "1245620", groupPlayable: false }),
        game({ name: "Overcooked 2", externalId: "728880", groupPlayable: true }),
        game({ name: "Unknown", externalId: "9", groupPlayable: null }),
      ],
      { requireOwned: true, requireInstalled: false, shortlistSize: 8 },
    );

    assert.deepEqual(list.map((candidate) => candidate.name), [
      "Overcooked 2",
      "Unknown",
    ]);
  });

  it("penalizes recent winners but can still include them", () => {
    const list = buildShortlist(
      [
        game({
          name: "Recent",
          externalId: "1",
          ownedCount: 2,
          installedCount: 2,
        }),
        game({
          name: "Fresh",
          externalId: "2",
          ownedCount: 2,
          installedCount: 1,
        }),
      ],
      {
        requireOwned: true,
        requireInstalled: false,
        shortlistSize: 8,
        recentWinnerKeys: new Set(["steam:1"]),
      },
    );
    assert.equal(list[0]!.name, "Fresh");
  });

  it("clamps shortlist between 1 and 5", () => {
    const games = Array.from({ length: 20 }, (_, i) =>
      game({
        name: `G${i}`,
        externalId: String(i),
        ownedCount: 2,
        installedCount: i % 2,
      }),
    );
    const large = buildShortlist(games, {
      requireOwned: true,
      requireInstalled: false,
      shortlistSize: 20,
    });
    assert.equal(large.length, 5);

    const small = buildShortlist(games, {
      requireOwned: true,
      requireInstalled: false,
      shortlistSize: 0,
    });
    assert.equal(small.length, 1);
  });

  it("deduplicates the same launcher record with different display names", () => {
    const list = buildShortlist(
      [
        game({ name: "Game Standard", externalId: "42" }),
        game({ name: "Game Definitive Edition", externalId: "42" }),
      ],
      { requireOwned: false, requireInstalled: false, shortlistSize: 5 },
    );
    assert.equal(list.length, 1);
    assert.equal(list[0]!.launcher, "steam");
    assert.equal(list[0]!.externalId, "42");
  });
});

describe("scoring", () => {
  it("eliminates on veto and scores hot/maybe", () => {
    const tallies = talliesFromVotes([
      { candidateId: "a", value: "hot" },
      { candidateId: "a", value: "maybe" },
      { candidateId: "b", value: "veto" },
      { candidateId: "b", value: "hot" },
    ]);
    assert.equal(tallies.get("a")!.score, 4);
    assert.equal(tallies.get("b")!.eliminated, true);
  });

  it("resolves clear winner without roulette", () => {
    const result = resolveWinner(
      [
        {
          candidateId: "a",
          tally: {
            hot: 2,
            maybe: 0,
            pass: 0,
            veto: 0,
            score: 6,
            eliminated: false,
            eliminatedReason: null,
          },
          installedCount: 1,
          ownedCount: 2,
        },
        {
          candidateId: "b",
          tally: {
            hot: 0,
            maybe: 1,
            pass: 1,
            veto: 0,
            score: 1,
            eliminated: false,
            eliminatedReason: null,
          },
          installedCount: 2,
          ownedCount: 2,
        },
      ],
      () => 0,
    );
    assert.equal(result.winnerId, "a");
    assert.equal(result.usedRoulette, false);
  });

  it("uses roulette on hard ties", () => {
    const result = resolveWinner(
      [
        {
          candidateId: "a",
          tally: {
            hot: 1,
            maybe: 0,
            pass: 0,
            veto: 0,
            score: 3,
            eliminated: false,
            eliminatedReason: null,
          },
          installedCount: 1,
          ownedCount: 2,
        },
        {
          candidateId: "b",
          tally: {
            hot: 1,
            maybe: 0,
            pass: 0,
            veto: 0,
            score: 3,
            eliminated: false,
            eliminatedReason: null,
          },
          installedCount: 1,
          ownedCount: 2,
        },
      ],
      () => 0.9,
    );
    assert.equal(result.winnerId, "b");
    assert.equal(result.usedRoulette, true);
    assert.deepEqual(result.tiedIds.sort(), ["a", "b"]);
  });

  it("filters new-round keepers", () => {
    const keep = candidatesForNewRound([
      {
        candidateId: "1",
        launcher: "steam",
        externalId: "1",
        tally: {
          hot: 1,
          maybe: 0,
          pass: 1,
          veto: 0,
          score: 3,
          eliminated: false,
          eliminatedReason: null,
        },
      },
      {
        candidateId: "2",
        launcher: "steam",
        externalId: "2",
        tally: {
          hot: 0,
          maybe: 0,
          pass: 2,
          veto: 0,
          score: 0,
          eliminated: false,
          eliminatedReason: null,
        },
      },
      {
        candidateId: "3",
        launcher: "steam",
        externalId: "3",
        tally: {
          hot: 1,
          maybe: 0,
          pass: 0,
          veto: 1,
          score: 3,
          eliminated: true,
          eliminatedReason: "veto",
        },
      },
    ]);
    assert.deepEqual(keep, [{ launcher: "steam", externalId: "1" }]);
  });
});
