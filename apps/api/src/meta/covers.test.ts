import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { riotCoverUrl } from "./covers.js";

describe("riotCoverUrl", () => {
  it("returns box art for LoL and VALORANT", () => {
    assert.match(
      riotCoverUrl("riot", "league_of_legends") ?? "",
      /League%20of%20Legends/,
    );
    assert.match(riotCoverUrl("riot", "valorant") ?? "", /VALORANT/);
  });

  it("ignores other launchers", () => {
    assert.equal(riotCoverUrl("steam", "league_of_legends"), null);
    assert.equal(riotCoverUrl("riot", "wild_rift"), null);
  });
});
