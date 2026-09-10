import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatSteamPriceLabel, stripHtml } from "./catalog.js";

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

describe("stripHtml", () => {
  it("strips html tags and decodes entities", () => {
    const raw = "<p>Un jeu d&#39;aventure &amp; d&#39;action.<br>Multijoueur &quot;en ligne&quot; !</p>";
    const clean = stripHtml(raw);
    assert.equal(clean, "Un jeu d'aventure & d'action.\nMultijoueur \"en ligne\" !");
  });

  it("handles empty or null values", () => {
    assert.equal(stripHtml(null), null);
    assert.equal(stripHtml(undefined), null);
    assert.equal(stripHtml("   "), null);
  });
});
