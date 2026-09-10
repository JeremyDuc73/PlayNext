import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeSteamLibrary, type SyncGame } from "./owned.js";

describe("mergeSteamLibrary", () => {
  it("marks games in ownedGames as owned", () => {
    const local: SyncGame[] = [
      {
        launcher: "steam",
        externalId: "100",
        name: "Game A",
        installed: true,
        owned: true,
        launchable: true,
      },
    ];
    const owned = [{ externalId: "100", name: "Game A" }];
    const merged = mergeSteamLibrary(local, owned);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]!.owned, true);
    assert.equal(merged[0]!.installed, true);
  });

  it("marks games not in ownedGames as unowned (Steam Family sharing)", () => {
    const local: SyncGame[] = [
      {
        launcher: "steam",
        externalId: "200",
        name: "Family Game",
        installed: true,
        owned: true,
        launchable: true,
      },
      {
        launcher: "steam",
        externalId: "100",
        name: "My Own Game",
        installed: true,
        owned: true,
        launchable: true,
      },
    ];
    // User only has license for 100
    const owned = [{ externalId: "100", name: "My Own Game" }];
    const merged = mergeSteamLibrary(local, owned);
    const familyGame = merged.find((g) => g.externalId === "200");
    const myGame = merged.find((g) => g.externalId === "100");

    assert.equal(myGame?.owned, true);
    assert.equal(familyGame?.owned, false);
    assert.equal(familyGame?.installed, true);
  });

  it("preserves local.owned when ownedGames is empty", () => {
    const local: SyncGame[] = [
      {
        launcher: "steam",
        externalId: "300",
        name: "Offline Game",
        installed: true,
        owned: false,
        launchable: true,
      },
    ];
    const merged = mergeSteamLibrary(local, []);
    assert.equal(merged[0]!.owned, false);
  });
});
