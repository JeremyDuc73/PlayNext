import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultEveningScheduledAt,
  formatParisWhen,
  parisLocalToUtc,
  parisYmd,
} from "./paris.js";

describe("parisLocalToUtc", () => {
  it("converts a CEST evening to UTC", () => {
    const instant = parisLocalToUtc("2026-08-14", "21:00");
    assert.equal(instant.toISOString(), "2026-08-14T19:00:00.000Z");
  });

  it("converts a CET evening to UTC", () => {
    const instant = parisLocalToUtc("2026-01-15", "21:00");
    assert.equal(instant.toISOString(), "2026-01-15T20:00:00.000Z");
  });

  it("rejects a malformed stamp", () => {
    assert.throws(() => parisLocalToUtc("14/08/2026", "21:00"));
  });
});

describe("parisYmd", () => {
  it("prints a Paris calendar day", () => {
    assert.equal(parisYmd(new Date("2026-08-14T22:30:00.000Z")), "2026-08-15");
  });
});

describe("defaultEveningScheduledAt", () => {
  it("pins tonight to 21:00 Paris", () => {
    const instant = defaultEveningScheduledAt(
      new Date("2026-08-14T10:00:00.000Z"),
    );
    assert.equal(instant.toISOString(), "2026-08-14T19:00:00.000Z");
  });
});

describe("formatParisWhen", () => {
  it("prints weekday, day, month and time", () => {
    const label = formatParisWhen("2026-08-14T19:00:00.000Z");
    assert.match(label, /vendredi 14 août/i);
    assert.match(label, /21:00/);
  });
});
