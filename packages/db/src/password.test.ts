// SPRINT-8: password hashing is slow scrypt with per-row salt; weak passwords rejected.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertPasswordPolicy, hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("stores scrypt with N, r, p, salt, and hash — never the password", async () => {
    const stored = await hashPassword("HaroldsOwner1!");
    assert.match(stored, /^scrypt\$32768\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    assert.equal(stored.includes("HaroldsOwner1!"), false);
    assert.equal(await verifyPassword("HaroldsOwner1!", stored), true);
    assert.equal(await verifyPassword("wrong-password", stored), false);
  });

  it("uses a unique salt so two hashes of the same password differ", async () => {
    const a = await hashPassword("HaroldsOwner1!");
    const b = await hashPassword("HaroldsOwner1!");
    assert.notEqual(a, b);
  });

  it("rejects short, letter-only, and obvious passwords", () => {
    assert.throws(() => assertPasswordPolicy("short1"), /at least 10/);
    assert.throws(() => assertPasswordPolicy("allletters"), /letter and one number/);
    assert.throws(() => assertPasswordPolicy("password123"), /stronger/);
    assert.throws(() => assertPasswordPolicy("test-owner12", "test-owner@localhost"), /email name/);
    assertPasswordPolicy("HaroldsOwner1!");
  });
});
