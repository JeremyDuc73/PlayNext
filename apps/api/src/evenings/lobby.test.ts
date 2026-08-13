import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  lobbyCanAdvance,
  lobbyDropUserIds,
  type LobbyParticipant,
} from "./lobby.js";

function person(
  userId: string,
  ready: boolean,
  present = true,
): LobbyParticipant {
  return {
    userId,
    present,
    readyAt: ready ? new Date("2026-08-13T12:00:00.000Z") : null,
  };
}

describe("lobbyCanAdvance", () => {
  it("refuses an empty table", () => {
    assert.equal(lobbyCanAdvance([]), false);
    assert.equal(lobbyCanAdvance([person("a", true, false)]), false);
  });

  it("waits while someone present is not ready", () => {
    assert.equal(
      lobbyCanAdvance([person("a", true), person("b", false)]),
      false,
    );
  });

  it("advances when every present player is ready", () => {
    assert.equal(
      lobbyCanAdvance([
        person("a", true),
        person("b", true),
        person("c", false, false),
      ]),
      true,
    );
  });
});

describe("lobbyDropUserIds", () => {
  it("drops unready present players except the organizer", () => {
    assert.deepEqual(
      lobbyDropUserIds(
        [person("host", false), person("b", false), person("c", true)],
        "host",
      ),
      ["b"],
    );
  });

  it("ignores people already marked absent", () => {
    assert.deepEqual(
      lobbyDropUserIds(
        [person("host", true), person("ghost", false, false)],
        "host",
      ),
      [],
    );
  });
});
