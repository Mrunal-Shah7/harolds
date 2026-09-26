// SPRINT-19: verification against a RUNNING standalone build. Not part of `pnpm test`: it needs
// the server. It proves, over HTTP, what unit tests cannot:
//
//   - the Apple Pay domain association file is served at exactly its path, 200, no redirect, no
//     auth, byte-identical to the Phase 0 record;
//   - it is not in the sitemap, and robots.txt is unchanged;
//   - the CSP header the running process sends for the wallet flags it was STARTED with (the flags
//     are read at run time, so one build is started several times with different values);
//   - /api/v1/health reports those flags.
//
//   BASE=http://127.0.0.1:3100 EXPECT_APPLE=false EXPECT_GOOGLE=false \
//     pnpm --filter @harolds/web exec tsx scripts/sprint19-wallet-e2e.ts
//
// It never contacts a payment gateway and never opens /checkout's Collect.js.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { contentSecurityPolicy, type NmiEnvironment } from "@harolds/config";

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
const EXPECT = {
  applePay: process.env.EXPECT_APPLE === "true",
  googlePay: process.env.EXPECT_GOOGLE === "true",
};
const PATH = "/.well-known/apple-developer-merchantid-domain-association";
const SHA256 = "6e6bea7f8889670155ec616394f08cff3c782e170f76db38c89ffdfe19107d51";

async function main(): Promise<void> {
  const out: Record<string, unknown> = { base: BASE, flagsExpected: EXPECT };

  // 1. The association file, as Apple's verifier fetches it (redirects NOT followed).
  const assoc = await fetch(`${BASE}${PATH}`, { redirect: "manual", headers: { "x-forwarded-proto": "https" } });
  const bytes = Buffer.from(await assoc.arrayBuffer());
  const sha = createHash("sha256").update(bytes).digest("hex");
  out.association = {
    status: assoc.status,
    location: assoc.headers.get("location"),
    contentType: assoc.headers.get("content-type"),
    contentLength: assoc.headers.get("content-length"),
    bytes: bytes.length,
    sha256: sha,
  };
  assert.equal(assoc.status, 200, "200, not a redirect or an auth challenge");
  assert.equal(assoc.headers.get("location"), null);
  assert.equal(sha, SHA256, "served byte-identical");

  // 2. Sitemap and robots.
  const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
  assert.equal(sitemap.includes(".well-known"), false, "not in the sitemap");
  const robots = await (await fetch(`${BASE}/robots.txt`)).text();
  out.robotsSha256 = createHash("sha256").update(robots).digest("hex");

  // 3. The CSP the running process sends, against the policy for the flags it was started with.
  const health = (await (await fetch(`${BASE}/api/v1/health`)).json()) as {
    data: { paymentEnvironment: NmiEnvironment; wallets: { applePay: boolean; googlePay: boolean } };
  };
  out.healthWallets = health.data.wallets;
  assert.deepEqual(health.data.wallets, EXPECT, "health reports the flags this process started with");

  const checkout = await fetch(`${BASE}/checkout`, { redirect: "manual" });
  const csp = checkout.headers.get("content-security-policy");
  out.checkoutCsp = csp;
  assert.equal(csp, contentSecurityPolicy(health.data.paymentEnvironment, EXPECT));
  const assocCsp = assoc.headers.get("content-security-policy");
  assert.equal(assocCsp, csp, "same header on every route");

  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
