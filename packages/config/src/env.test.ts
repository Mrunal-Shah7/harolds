// SPRINT-5 / SPRINT-18.2: printer configuration is required — the app must refuse to start without it
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEnv } from "./env";

function baseEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/harolds?schema=public",
    NODE_ENV: "test",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    NMI_ENVIRONMENT: "sandbox",
    NMI_SECURITY_KEY_SANDBOX: "sandbox-security-key",
    NMI_TOKENIZATION_KEY_SANDBOX: "sandbox-tokenization-key",
    NMI_WEBHOOK_SIGNING_KEY_SANDBOX: "sandbox-signing-key",
    PRINTER_SERIAL_NUMBER: "XBVN044247",
    PRINTER_SDP_SHARED_SECRET: "secret",
    ...overrides,
  };
}

describe("parseEnv printer requirements", () => {
  it("accepts a single serial and secret", () => {
    const env = parseEnv(baseEnv());
    assert.equal(env.PRINTER_SERIAL_NUMBER, "XBVN044247");
    assert.equal(env.PRINTER_SDP_SHARED_SECRET, "secret");
  });

  it("refuses to start when PRINTER_SERIAL_NUMBER is missing", () => {
    const copy = baseEnv();
    delete copy.PRINTER_SERIAL_NUMBER;
    assert.throws(() => parseEnv(copy), /PRINTER_SERIAL_NUMBER/);
  });

  it("refuses to start when PRINTER_SERIAL_NUMBER is empty", () => {
    assert.throws(() => parseEnv(baseEnv({ PRINTER_SERIAL_NUMBER: "" })), /PRINTER_SERIAL_NUMBER/);
  });

  it("refuses to start when PRINTER_SDP_SHARED_SECRET is missing", () => {
    const copy = baseEnv();
    delete copy.PRINTER_SDP_SHARED_SECRET;
    assert.throws(() => parseEnv(copy), /PRINTER_SDP_SHARED_SECRET/);
  });
});

describe("parseEnv production provider requirements", () => {
  it("names every missing production variable at once", () => {
    const copy = baseEnv({ NODE_ENV: "production" });
    delete copy.EMAIL_API_KEY;
    delete copy.EMAIL_FROM_ADDRESS;
    try {
      parseEnv(copy);
      assert.fail("expected throw");
    } catch (err) {
      const text = (err as Error).message;
      // SPRINT-17: TWILIO_* used to be listed here too; SMS was removed, so email is the only
      // provider a production start still requires.
      assert.match(text, /EMAIL_API_KEY/);
      assert.match(text, /EMAIL_FROM_ADDRESS/);
    }
  });

  it("refuses a short print secret in production and accepts it in development", () => {
    assert.throws(
      () =>
        parseEnv(
          baseEnv({
            NODE_ENV: "production",
            PRINTER_SDP_SHARED_SECRET: "short",
            EMAIL_API_KEY: "re_x",
            EMAIL_FROM_ADDRESS: "orders@example.com",
          }),
        ),
      /PRINTER_SDP_SHARED_SECRET/,
    );
    const dev = parseEnv(baseEnv({ NODE_ENV: "development", PRINTER_SDP_SHARED_SECRET: "short" }));
    assert.equal(dev.PRINTER_SDP_SHARED_SECRET, "short");
  });

  it("accepts a production env when every required provider is set and the print secret is long enough", () => {
    const env = parseEnv(
      baseEnv({
        NODE_ENV: "production",
        EMAIL_API_KEY: "re_x",
        EMAIL_FROM_ADDRESS: "orders@example.com",
        PRINTER_SDP_SHARED_SECRET: "a".repeat(32),
      }),
    );
    assert.equal(env.NODE_ENV, "production");
  });

  // SPRINT-18.2: the Collect.js key is the ACTIVE triple's tokenization key, resolved per request.
  // There is no NEXT_PUBLIC_ copy to be missing, stale, or different.
  const productionReady = {
    NODE_ENV: "production",
    EMAIL_API_KEY: "re_x",
    EMAIL_FROM_ADDRESS: "orders@example.com",
    PRINTER_SDP_SHARED_SECRET: "a".repeat(32),
  };

  it("starts in production on the live gateway with only the live triple set", () => {
    const env = parseEnv(
      baseEnv({
        ...productionReady,
        NMI_ENVIRONMENT: "production",
        NMI_SECURITY_KEY_SANDBOX: undefined,
        NMI_TOKENIZATION_KEY_SANDBOX: undefined,
        NMI_WEBHOOK_SIGNING_KEY_SANDBOX: undefined,
        NMI_SECURITY_KEY_LIVE: "live-security-key",
        NMI_TOKENIZATION_KEY_LIVE: "live-tokenization-key",
        NMI_WEBHOOK_SIGNING_KEY_LIVE: "live-signing-key",
      }),
    );
    assert.equal(env.NMI_ENVIRONMENT, "production");
  });

  it("refuses production start when the active tokenization key is missing", () => {
    assert.throws(
      () => parseEnv(baseEnv({ ...productionReady, NMI_TOKENIZATION_KEY_SANDBOX: "" })),
      /NMI_TOKENIZATION_KEY_SANDBOX: required in production/,
    );
  });

  it("names variables, never values, when the live triple is incomplete", () => {
    const sentinel = "SENTINEL-CREDENTIAL-VALUE";
    try {
      parseEnv(
        baseEnv({
          ...productionReady,
          NMI_ENVIRONMENT: "production",
          NMI_SECURITY_KEY_LIVE: sentinel,
          NMI_TOKENIZATION_KEY_LIVE: sentinel,
          NMI_WEBHOOK_SIGNING_KEY_LIVE: "",
          NMI_SECURITY_KEY_SANDBOX: sentinel,
        }),
      );
      assert.fail("expected throw");
    } catch (err) {
      const text = (err as Error).message;
      assert.match(text, /NMI_WEBHOOK_SIGNING_KEY_LIVE/);
      assert.equal(text.includes(sentinel), false);
    }
  });

  it("refuses an unrecognised NMI_ENVIRONMENT instead of falling through to sandbox", () => {
    for (const value of ["Production", "live", " production"]) {
      assert.throws(() => parseEnv(baseEnv({ NMI_ENVIRONMENT: value })), /NMI_ENVIRONMENT/);
    }
  });

  it("does not read the retired NEXT_PUBLIC_NMI_* variables", () => {
    const env = parseEnv(
      baseEnv({ NEXT_PUBLIC_NMI_ENVIRONMENT: "production", NEXT_PUBLIC_NMI_TOKENIZATION_KEY: "stale" }),
    ) as Record<string, unknown>;
    assert.equal("NEXT_PUBLIC_NMI_ENVIRONMENT" in env, false);
    assert.equal("NEXT_PUBLIC_NMI_TOKENIZATION_KEY" in env, false);
    assert.equal(env.NMI_ENVIRONMENT, "sandbox");
  });

  it("skips production provider guards when compiling (next build sets NEXT_PHASE)", () => {
    const copy = baseEnv({ NODE_ENV: "production" });
    const env = parseEnv(copy, { skipProductionGuards: true });
    assert.equal(env.NODE_ENV, "production");
  });
});
