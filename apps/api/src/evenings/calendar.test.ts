import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isOnGroupCalendar } from "./calendar.js";

describe("isOnGroupCalendar", () => {
  it("keeps a ritual only once voting or validated", () => {
    assert.equal(
      isOnGroupCalendar({ kind: "ritual", status: "lobby" }),
      false,
    );
    assert.equal(
      isOnGroupCalendar({ kind: "ritual", status: "selection" }),
      false,
    );
    assert.equal(
      isOnGroupCalendar({ kind: "ritual", status: "voting" }),
      true,
    );
    assert.equal(
      isOnGroupCalendar({ kind: "ritual", status: "revealed" }),
      true,
    );
    assert.equal(
      isOnGroupCalendar({ kind: "ritual", status: "closed" }),
      true,
    );
  });

  it("keeps a direct evening as soon as the game is locked", () => {
    assert.equal(
      isOnGroupCalendar({ kind: "direct", status: "lobby" }),
      true,
    );
    assert.equal(
      isOnGroupCalendar({ kind: "direct", status: "revealed" }),
      true,
    );
    assert.equal(
      isOnGroupCalendar({ kind: "direct", status: "closed" }),
      true,
    );
  });

  it("drops cancelled evenings", () => {
    assert.equal(
      isOnGroupCalendar({ kind: "direct", status: "cancelled" }),
      false,
    );
    assert.equal(
      isOnGroupCalendar({ kind: "ritual", status: "cancelled" }),
      false,
    );
  });
});
