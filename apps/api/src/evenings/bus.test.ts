import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { eveningBus } from "./bus.js";

describe("eveningBus", () => {
  it("emits and receives updates for a specific evening", () => {
    let received: { eveningId: string; reason?: string } | null = null;
    const unsubscribe = eveningBus.onUpdate("evening-123", (data) => {
      received = data;
    });

    eveningBus.emitUpdate("other-evening", "ready");
    assert.equal(received, null);

    eveningBus.emitUpdate("evening-123", "vote");
    assert.deepEqual(received, { eveningId: "evening-123", reason: "vote" });

    unsubscribe();
    received = null;
    eveningBus.emitUpdate("evening-123", "close");
    assert.equal(received, null);
  });
});
