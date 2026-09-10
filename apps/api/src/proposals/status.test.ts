import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateProposalApproval,
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

describe("evaluateProposalApproval", () => {
  it("handles unanimous approval rule", () => {
    const pending = evaluateProposalApproval({
      rule: "unanimous",
      memberCount: 3,
      hotCount: 2,
      noCount: 0,
      pendingCount: 1,
    });
    assert.equal(pending.approved, false);
    assert.equal(pending.rejected, false);
    assert.equal(pending.targetHotCount, 3);

    const approved = evaluateProposalApproval({
      rule: "unanimous",
      memberCount: 3,
      hotCount: 3,
      noCount: 0,
      pendingCount: 0,
    });
    assert.equal(approved.approved, true);
    assert.equal(approved.rejected, false);

    const rejected = evaluateProposalApproval({
      rule: "unanimous",
      memberCount: 3,
      hotCount: 2,
      noCount: 1,
      pendingCount: 0,
    });
    assert.equal(rejected.approved, false);
    assert.equal(rejected.rejected, true);
  });

  it("handles count quorum threshold (e.g. 3 friends hot)", () => {
    // 5 members, threshold 3
    const inProgress = evaluateProposalApproval({
      rule: "count",
      threshold: 3,
      memberCount: 5,
      hotCount: 2,
      noCount: 1,
      pendingCount: 2,
    });
    assert.equal(inProgress.approved, false);
    assert.equal(inProgress.rejected, false);
    assert.equal(inProgress.targetHotCount, 3);

    // 3 are hot, even if 1 says no and 1 pending -> APPROVED!
    const reached = evaluateProposalApproval({
      rule: "count",
      threshold: 3,
      memberCount: 5,
      hotCount: 3,
      noCount: 1,
      pendingCount: 1,
    });
    assert.equal(reached.approved, true);
    assert.equal(reached.rejected, false);

    // 3 say no out of 5 -> impossible to reach 3 hot -> REJECTED
    const impossible = evaluateProposalApproval({
      rule: "count",
      threshold: 3,
      memberCount: 5,
      hotCount: 1,
      noCount: 3,
      pendingCount: 1,
    });
    assert.equal(impossible.approved, false);
    assert.equal(impossible.rejected, true);
  });

  it("handles majority rule", () => {
    // 4 members -> majority is 3
    const waiting = evaluateProposalApproval({
      rule: "majority",
      memberCount: 4,
      hotCount: 2,
      noCount: 1,
      pendingCount: 1,
    });
    assert.equal(waiting.approved, false);
    assert.equal(waiting.targetHotCount, 3);

    const majorityReached = evaluateProposalApproval({
      rule: "majority",
      memberCount: 4,
      hotCount: 3,
      noCount: 0,
      pendingCount: 1,
    });
    assert.equal(majorityReached.approved, true);
  });
});
