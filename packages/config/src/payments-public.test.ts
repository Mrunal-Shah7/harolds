// SPRINT-12 / SPRINT-17: unit tests for the public Collect.js build-time identifiers.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertPublicPaymentIdentifiersForBuild,
  missingPublicPaymentIdentifiers,
  publicPaymentIdsPresentAtBuild,
} from "./payments-public";

describe("public payment identifiers", () => {
  it("names every missing NEXT_PUBLIC_NMI_* value", () => {
    const missing = missingPublicPaymentIdentifiers({});
    assert.equal(missing.length, 2);
    assert.ok(missing.some((m) => m.startsWith("NEXT_PUBLIC_NMI_TOKENIZATION_KEY")));
    assert.ok(missing.some((m) => m.startsWith("NEXT_PUBLIC_NMI_ENVIRONMENT")));
  });

  it("rejects an invalid environment name", () => {
    const missing = missingPublicPaymentIdentifiers({
      NEXT_PUBLIC_NMI_TOKENIZATION_KEY: "tok-sandbox",
      NEXT_PUBLIC_NMI_ENVIRONMENT: "staging",
    });
    assert.equal(missing.length, 1);
    assert.match(missing[0]!, /sandbox or production/);
  });

  it("treats a whitespace-only key as absent", () => {
    // A key pasted as a stray space is the failure mode that otherwise reaches the gateway
    // and comes back as an opaque "API key not found".
    const missing = missingPublicPaymentIdentifiers({
      NEXT_PUBLIC_NMI_TOKENIZATION_KEY: "   ",
      NEXT_PUBLIC_NMI_ENVIRONMENT: "sandbox",
    });
    assert.equal(missing.length, 1);
    assert.match(missing[0]!, /NEXT_PUBLIC_NMI_TOKENIZATION_KEY/);
  });

  it("passes when both are set", () => {
    const env = {
      NEXT_PUBLIC_NMI_TOKENIZATION_KEY: "tok-sandbox",
      NEXT_PUBLIC_NMI_ENVIRONMENT: "sandbox",
    };
    assert.deepEqual(missingPublicPaymentIdentifiers(env), []);
    assert.equal(publicPaymentIdsPresentAtBuild(env), true);
  });

  it("assertPublicPaymentIdentifiersForBuild fails loudly naming the variables", () => {
    assert.throws(
      () => assertPublicPaymentIdentifiersForBuild({}),
      /NEXT_PUBLIC_NMI_TOKENIZATION_KEY/,
    );
  });
});
