// SPRINT-12: unit tests for public Square build-time identifiers.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertPublicSquareIdentifiersForBuild,
  missingPublicSquareIdentifiers,
  publicSquareIdsPresentAtBuild,
} from "./square-public";

describe("public Square identifiers", () => {
  it("names every missing NEXT_PUBLIC_SQUARE_* value", () => {
    const missing = missingPublicSquareIdentifiers({});
    assert.equal(missing.length, 3);
    assert.ok(missing.some((m) => m.startsWith("NEXT_PUBLIC_SQUARE_APPLICATION_ID")));
    assert.ok(missing.some((m) => m.startsWith("NEXT_PUBLIC_SQUARE_LOCATION_ID")));
    assert.ok(missing.some((m) => m.startsWith("NEXT_PUBLIC_SQUARE_ENVIRONMENT")));
  });

  it("rejects an invalid environment name", () => {
    const missing = missingPublicSquareIdentifiers({
      NEXT_PUBLIC_SQUARE_APPLICATION_ID: "sandbox-app",
      NEXT_PUBLIC_SQUARE_LOCATION_ID: "LTEST",
      NEXT_PUBLIC_SQUARE_ENVIRONMENT: "staging",
    });
    assert.equal(missing.length, 1);
    assert.match(missing[0]!, /sandbox or production/);
  });

  it("passes when all three are set", () => {
    const env = {
      NEXT_PUBLIC_SQUARE_APPLICATION_ID: "sandbox-app",
      NEXT_PUBLIC_SQUARE_LOCATION_ID: "LTEST",
      NEXT_PUBLIC_SQUARE_ENVIRONMENT: "sandbox",
    };
    assert.deepEqual(missingPublicSquareIdentifiers(env), []);
    assert.equal(publicSquareIdsPresentAtBuild(env), true);
  });

  it("assertPublicSquareIdentifiersForBuild fails loudly naming the variables", () => {
    assert.throws(
      () => assertPublicSquareIdentifiersForBuild({}),
      /NEXT_PUBLIC_SQUARE_APPLICATION_ID/,
    );
  });
});
