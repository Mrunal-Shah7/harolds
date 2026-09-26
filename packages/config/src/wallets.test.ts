// SPRINT-19: wallet flags and the wallet CSP. Both flags off must be indistinguishable from the
// card-only checkout, byte for byte; each flag adds its own origins and nothing else.
import path from "node:path";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { env, parseEnv } from "./env";
import { GOOGLE_PAY_JS_URL, WALLET_ORIGINS } from "./nmi-gateway";
import { getNmiBrowserConfig, getWalletFlags } from "./payments";
import { contentSecurityPolicy } from "./security";

/**
 * The header as it was BEFORE Sprint 19, captured from `contentSecurityPolicy()` at commit
 * 62b4958 and from the running build's response. Literal on purpose: a value re-derived from the
 * code under test would prove nothing.
 */
const PRE_SPRINT_19_CSP = {
  production:
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://mpc.transactiongateway.com https://applepay.cdn-apple.com; style-src 'self' 'unsafe-inline' https://mpc.transactiongateway.com; img-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; frame-src 'self' https://mpc.transactiongateway.com; connect-src 'self' https://mpc.transactiongateway.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests",
  sandbox:
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://sandbox.nmi.com https://applepay.cdn-apple.com; style-src 'self' 'unsafe-inline' https://sandbox.nmi.com; img-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; frame-src 'self' https://sandbox.nmi.com; connect-src 'self' https://sandbox.nmi.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests",
} as const;

const OFF = { applePay: false, googlePay: false };

function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp.split(";").map((d) => {
      const [name, ...values] = d.trim().split(/\s+/);
      return [name!, values];
    }),
  );
}

/** Per directive, the sources `after` has that `before` does not — and the reverse. */
function diff(before: string, after: string): { added: Record<string, string[]>; removed: Record<string, string[]> } {
  const a = directives(before);
  const b = directives(after);
  const added: Record<string, string[]> = {};
  const removed: Record<string, string[]> = {};
  for (const name of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(name) ?? [];
    const y = b.get(name) ?? [];
    const plus = y.filter((s) => !x.includes(s));
    const minus = x.filter((s) => !y.includes(s));
    if (plus.length) added[name] = plus;
    if (minus.length) removed[name] = minus;
  }
  return { added, removed };
}

describe("wallet flags", () => {
  const base = {
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/harolds?schema=public",
    NODE_ENV: "test",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    NMI_ENVIRONMENT: "sandbox",
    PRINTER_SERIAL_NUMBER: "XBVN044247",
    PRINTER_SDP_SHARED_SECRET: "secret",
  };

  it("default to off when unset", () => {
    const parsed = parseEnv(base);
    assert.equal(parsed.PAYMENTS_APPLE_PAY_ENABLED, "false");
    assert.equal(parsed.PAYMENTS_GOOGLE_PAY_ENABLED, "false");
    assert.deepEqual(getWalletFlags(parsed), OFF);
  });

  it("turn on only for exactly \"true\"", () => {
    const parsed = parseEnv({ ...base, PAYMENTS_APPLE_PAY_ENABLED: "true", PAYMENTS_GOOGLE_PAY_ENABLED: "false" });
    assert.deepEqual(getWalletFlags(parsed), { applePay: true, googlePay: false });
  });

  for (const name of ["PAYMENTS_APPLE_PAY_ENABLED", "PAYMENTS_GOOGLE_PAY_ENABLED"]) {
    for (const bad of ["TRUE", "1", "yes", "on", ""]) {
      it(`refuses to start when ${name}=${JSON.stringify(bad)}, naming the variable`, () => {
        assert.throws(() => parseEnv({ ...base, [name]: bad }), (err: Error) => {
          assert.match(err.message, new RegExp(`${name}: ${name} must be "true" or "false"`));
          return true;
        });
      });
    }
  }
});

describe("wallet browser config (the 18.2 props path)", () => {
  it("carries the flags, and loads Google's script only when Google Pay is on", () => {
    const saved = { ...env };
    try {
      env.PAYMENTS_APPLE_PAY_ENABLED = "false";
      env.PAYMENTS_GOOGLE_PAY_ENABLED = "false";
      assert.deepEqual(getNmiBrowserConfig().wallets, {
        applePay: false,
        googlePay: false,
        googlePayJsUrl: null,
        googlePayEnvironment: env.NMI_ENVIRONMENT === "production" ? "PRODUCTION" : "TEST",
      });
      env.PAYMENTS_GOOGLE_PAY_ENABLED = "true";
      env.PAYMENTS_APPLE_PAY_ENABLED = "true";
      env.NMI_ENVIRONMENT = "sandbox";
      assert.deepEqual(getNmiBrowserConfig().wallets, {
        applePay: true,
        googlePay: true,
        googlePayJsUrl: GOOGLE_PAY_JS_URL,
        googlePayEnvironment: "TEST",
      });
      env.NMI_ENVIRONMENT = "production";
      assert.equal(getNmiBrowserConfig().wallets.googlePayEnvironment, "PRODUCTION");
    } finally {
      Object.assign(env, saved);
    }
  });
});

describe("wallet CSP", () => {
  for (const environment of ["sandbox", "production"] as const) {
    it(`is byte-identical to the pre-Sprint-19 header with both flags off (${environment})`, () => {
      assert.equal(contentSecurityPolicy(environment, OFF), PRE_SPRINT_19_CSP[environment]);
    });

    it(`adds nothing for Apple Pay: its SDK host is already allowed (${environment})`, () => {
      assert.equal(contentSecurityPolicy(environment, { applePay: true, googlePay: false }), PRE_SPRINT_19_CSP[environment]);
    });

    it(`adds exactly Google Pay's origins, in exactly its directives (${environment})`, () => {
      const change = diff(PRE_SPRINT_19_CSP[environment], contentSecurityPolicy(environment, { applePay: false, googlePay: true }));
      assert.deepEqual(change.removed, {});
      assert.deepEqual(change.added, {
        "script-src": [WALLET_ORIGINS.googlePay],
        "frame-src": [WALLET_ORIGINS.collectWalletFrames, WALLET_ORIGINS.googlePay],
        "connect-src": [WALLET_ORIGINS.googlePay],
      });
    });

    it(`with both on equals Google Pay alone (${environment})`, () => {
      assert.equal(
        contentSecurityPolicy(environment, { applePay: true, googlePay: true }),
        contentSecurityPolicy(environment, { applePay: false, googlePay: true }),
      );
    });
  }

  it("the Google Pay script the checkout loads is on an allowed origin only when the flag is on", () => {
    assert.ok(GOOGLE_PAY_JS_URL.startsWith(`${WALLET_ORIGINS.googlePay}/`));
  });
});

describe("wallet origins are stated once", () => {
  /** Source files, tests excluded: a test's literal fixtures are what it compares against. */
  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".next" || name === "generated") continue;
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) sourceFiles(full, out);
      else if (/\.(ts|tsx|mjs|js)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
    }
    return out;
  }

  const roots = [path.join(rootDir, "apps/web/src"), path.join(rootDir, "packages"), path.join(rootDir, "scripts")];
  const files = roots.flatMap((r) => sourceFiles(r));

  for (const origin of Object.values(WALLET_ORIGINS)) {
    it(`${origin} appears in exactly one source module`, () => {
      const host = origin.replace("https://", "");
      const hits = files.filter((f) => readFileSync(f, "utf8").includes(host)).map((f) => path.relative(rootDir, f).replace(/\\/g, "/"));
      assert.deepEqual(hits, ["packages/config/src/nmi-gateway.ts"]);
    });
  }
});
