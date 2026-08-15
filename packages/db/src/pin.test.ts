// SPRINT-6: PIN hashing is compare-only; stored values are not reversible.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateSessionToken, hashPin, hashSessionToken, isPlausiblePin, verifyPin } from "./pin";

describe("pin hashing", () => {
  it("accepts 4–8 digit PINs only", () => {
    assert.equal(isPlausiblePin("2468"), true);
    assert.equal(isPlausiblePin("12345678"), true);
    assert.equal(isPlausiblePin("123"), false);
    assert.equal(isPlausiblePin("123456789"), false);
    assert.equal(isPlausiblePin("24a8"), false);
  });

  it("hashes and verifies; the stored value is not the PIN", async () => {
    const stored = await hashPin("2468");
    assert.equal(stored.includes("2468"), false);
    assert.equal(await verifyPin("2468", stored), true);
    assert.equal(await verifyPin("0000", stored), false);
    assert.equal(await verifyPin("2468", "not-a-hash"), false);
  });

  it("uses a unique salt so two hashes of the same PIN differ", async () => {
    const a = await hashPin("2468");
    const b = await hashPin("2468");
    assert.notEqual(a, b);
    assert.equal(await verifyPin("2468", a), true);
    assert.equal(await verifyPin("2468", b), true);
  });
});

describe("session tokens", () => {
  it("stores only a hash; the raw token cannot be recovered from it", () => {
    const raw = generateSessionToken();
    const hashed = hashSessionToken(raw);
    assert.notEqual(raw, hashed);
    assert.equal(hashed.length, 64);
    assert.equal(raw.includes(hashed), false);
    assert.equal(hashed.includes(raw), false);
    assert.equal(hashSessionToken(raw), hashed);
    assert.notEqual(hashSessionToken(raw + "x"), hashed);
  });
});
