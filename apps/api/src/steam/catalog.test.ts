import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatSteamPriceLabel } from "./catalog.js";

describe("formatSteamPriceLabel", () => {
  it("formats a euro price", () => {
    const label = formatSteamPriceLabel({ currency: "EUR", finalCents: 1999 });
    assert.match(label, /19,99/);
    assert.match(label, /€/);
  });

  it("marks a free title", () => {
    assert.equal(formatSteamPriceLabel({ isFree: true }), "gratuit");
    assert.equal(formatSteamPriceLabel({ finalCents: 0 }), "gratuit");
  });

  it("marks an unknown price", () => {
    assert.equal(formatSteamPriceLabel({}), "—");
    assert.equal(formatSteamPriceLabel({ finalCents: null }), "—");
  });
});
