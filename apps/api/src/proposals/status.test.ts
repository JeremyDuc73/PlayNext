import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ownsProposedGame,
  proposalMemberStatus,
  proposalMemberStatusLabel,
} from "./status.js";

describe("proposalMemberStatus", () => {
  it("keeps owners in the vote", () => {
    assert.equal(proposalMemberStatus("hot"), "hot");
    assert.equal(proposalMemberStatus(null), "pending");
    assert.equal(proposalMemberStatusLabel("pending"), "En attente");
  });

  it("maps a missing reply to pending", () => {
    assert.equal(proposalMemberStatus(null), "pending");
    assert.equal(proposalMemberStatus("no"), "no");
    assert.equal(proposalMemberStatusLabel("no"), "Non");
  });
});

describe("ownsProposedGame", () => {
  it("matches the Steam AppID", () => {
    assert.equal(
      ownsProposedGame(
        [{ launcher: "steam", externalId: "570", name: "Dota 2" }],
        { launcher: "steam", externalId: "570", name: "Dota 2" },
      ),
      true,
    );
  });

  it("matches the same title on another launcher", () => {
    assert.equal(
      ownsProposedGame(
        [
          {
            launcher: "xbox",
            externalId: "abc",
            name: "Hades",
          },
        ],
        { launcher: "steam", externalId: "1145360", name: "Hades" },
      ),
      true,
    );
  });

  it("ignores a different title", () => {
    assert.equal(
      ownsProposedGame(
        [{ launcher: "steam", externalId: "1", name: "Celeste" }],
        { launcher: "steam", externalId: "570", name: "Dota 2" },
      ),
      false,
    );
  });
});
