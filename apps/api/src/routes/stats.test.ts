import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ADMIN_ACCESS_CODE,
  EXCLUDED_DISCORD_IDS,
  EXCLUDED_USERNAMES,
  isExcludedUser,
  isValidAdminCode,
} from "./stats.js";

describe("admin security & code access", () => {
  it("uses the fidjie access code", () => {
    assert.equal(ADMIN_ACCESS_CODE, "fidjie");
  });

  it("validates the admin access code case-insensitively and trimmed", () => {
    assert.equal(isValidAdminCode("fidjie"), true);
    assert.equal(isValidAdminCode("FIDJIE"), true);
    assert.equal(isValidAdminCode("  fidjie  "), true);
    assert.equal(isValidAdminCode("Fidjie"), true);
  });

  it("rejects invalid or empty codes", () => {
    assert.equal(isValidAdminCode(""), false);
    assert.equal(isValidAdminCode(null), false);
    assert.equal(isValidAdminCode(undefined), false);
    assert.equal(isValidAdminCode("wrong"), false);
    assert.equal(isValidAdminCode("admin"), false);
  });
});

describe("stats exclusion rules", () => {
  it("strictly defines the excluded account constants", () => {
    assert.deepEqual(EXCLUDED_DISCORD_IDS, ["230720809218342912"]);
    assert.deepEqual(EXCLUDED_USERNAMES, ["nashoba_"]);
  });

  it("identifies the excluded user by exact discordId", () => {
    assert.equal(
      isExcludedUser({
        discordId: "230720809218342912",
        username: "anything",
      }),
      true,
    );
  });

  it("identifies the excluded user by username case-insensitively", () => {
    assert.equal(
      isExcludedUser({
        discordId: "999999999999999999",
        username: "nashoba_",
      }),
      true,
    );
    assert.equal(
      isExcludedUser({
        discordId: "999999999999999999",
        username: "NASHOBA_",
      }),
      true,
    );
    assert.equal(
      isExcludedUser({
        discordId: "999999999999999999",
        username: " Nashoba_ ",
      }),
      true,
    );
  });

  it("identifies the excluded user by globalName case-insensitively", () => {
    assert.equal(
      isExcludedUser({
        discordId: "999999999999999999",
        username: "custom_name",
        globalName: "nashoba_",
      }),
      true,
    );
  });

  it("allows normal player accounts through", () => {
    assert.equal(
      isExcludedUser({
        discordId: "123456789012345678",
        username: "thomas",
        globalName: "Thomas",
      }),
      false,
    );
    assert.equal(
      isExcludedUser({
        discordId: "876543210987654321",
        username: "player_one",
      }),
      false,
    );
  });
});
