// SPRINT-5: printer configuration is required — the app must refuse to start without it
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
    SQUARE_APPLICATION_ID: "sandbox-app",
    SQUARE_ACCESS_TOKEN: "sandbox-token",
    SQUARE_LOCATION_ID: "LTEST",
    SQUARE_ENVIRONMENT: "sandbox",
    SQUARE_WEBHOOK_SIGNATURE_KEY: "whsec",
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
    delete copy.TWILIO_ACCOUNT_SID;
    delete copy.TWILIO_AUTH_TOKEN;
    delete copy.TWILIO_FROM_NUMBER;
    delete copy.EMAIL_API_KEY;
    delete copy.EMAIL_FROM_ADDRESS;
    try {
      parseEnv(copy);
      assert.fail("expected throw");
    } catch (err) {
      const text = (err as Error).message;
      assert.match(text, /TWILIO_ACCOUNT_SID/);
      assert.match(text, /TWILIO_AUTH_TOKEN/);
      assert.match(text, /TWILIO_FROM_NUMBER/);
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
            TWILIO_ACCOUNT_SID: "ACxx",
            TWILIO_AUTH_TOKEN: "tok",
            TWILIO_FROM_NUMBER: "+17085550000",
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
        TWILIO_ACCOUNT_SID: "ACxx",
        TWILIO_AUTH_TOKEN: "tok",
        TWILIO_FROM_NUMBER: "+17085550000",
        EMAIL_API_KEY: "re_x",
        EMAIL_FROM_ADDRESS: "orders@example.com",
        PRINTER_SDP_SHARED_SECRET: "a".repeat(32),
      }),
    );
    assert.equal(env.NODE_ENV, "production");
  });

  it("skips production provider guards when compiling (next build sets NEXT_PHASE)", () => {
    const copy = baseEnv({ NODE_ENV: "production" });
    delete copy.TWILIO_ACCOUNT_SID;
    const env = parseEnv(copy, { skipProductionGuards: true });
    assert.equal(env.NODE_ENV, "production");
  });
});
