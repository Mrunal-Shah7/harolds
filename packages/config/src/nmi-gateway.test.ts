// SPRINT-18.2 / SPRINT-19: pins the gateway URLs, in both branches, to the values Merchant Pay Connect
// confirmed. This file is the one deliberate second statement of the host outside
// nmi-gateway.ts: a test that derived its expectations from the module would prove nothing.
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { env } from "./env";
import { activeNmiGateway, nmiGatewayUrls } from "./nmi-gateway";
import { getNmiBrowserConfig, getNmiConfig } from "./payments";
import { contentSecurityPolicy } from "./security";

const ORIGINAL = { ...env };
afterEach(() => {
  Object.assign(env, ORIGINAL);
});

describe("gateway URLs", () => {
  it("production resolves every surface to Merchant Pay Connect", () => {
    assert.deepEqual(nmiGatewayUrls("production"), {
      environment: "production",
      origin: "https://mpc.transactiongateway.com",
      transactUrl: "https://mpc.transactiongateway.com/api/transact.php",
      queryUrl: "https://mpc.transactiongateway.com/api/query.php",
      collectJsUrl: "https://mpc.transactiongateway.com/token/Collect.js",
    });
  });

  it("sandbox resolves every surface to the NMI sandbox", () => {
    assert.deepEqual(nmiGatewayUrls("sandbox"), {
      environment: "sandbox",
      origin: "https://sandbox.nmi.com",
      transactUrl: "https://sandbox.nmi.com/api/transact.php",
      queryUrl: "https://sandbox.nmi.com/api/query.php",
      collectJsUrl: "https://sandbox.nmi.com/token/Collect.js",
    });
  });

  it("never resolves production to a generic NMI host", () => {
    const urls = Object.values(nmiGatewayUrls("production")).join(" ");
    assert.doesNotMatch(urls, /nmi\.com|networkmerchants\.com/);
  });

  it("refuses an environment it has no gateway for, rather than falling through", () => {
    assert.throws(() => nmiGatewayUrls("live" as never), /No payment gateway is defined/);
  });

  it("follows NMI_ENVIRONMENT, together with the credential triple", () => {
    env.NMI_ENVIRONMENT = "production";
    env.NMI_SECURITY_KEY_LIVE = "test-live-security";
    env.NMI_TOKENIZATION_KEY_LIVE = "test-live-tokenization";
    env.NMI_WEBHOOK_SIGNING_KEY_LIVE = "test-live-signing";
    assert.equal(activeNmiGateway().origin, "https://mpc.transactiongateway.com");
    assert.equal(getNmiConfig().gateway.transactUrl, "https://mpc.transactiongateway.com/api/transact.php");
    assert.deepEqual(gatewayPart(getNmiBrowserConfig()), {
      collectJsUrl: "https://mpc.transactiongateway.com/token/Collect.js",
      tokenizationKey: "test-live-tokenization",
    });

    env.NMI_ENVIRONMENT = "sandbox";
    env.NMI_TOKENIZATION_KEY_SANDBOX = "  test-sandbox-tokenization \n";
    assert.deepEqual(gatewayPart(getNmiBrowserConfig()), {
      collectJsUrl: "https://sandbox.nmi.com/token/Collect.js",
      tokenizationKey: "test-sandbox-tokenization",
    });
  });
});

/** SPRINT-19: the gateway half of the browser config; `wallets` is covered in wallets.test.ts. */
function gatewayPart(c: ReturnType<typeof getNmiBrowserConfig>) {
  return { collectJsUrl: c.collectJsUrl, tokenizationKey: c.tokenizationKey };
}

describe("generated CSP, per environment", () => {
  it("production allows Merchant Pay Connect and no generic NMI host", () => {
    const csp = contentSecurityPolicy("production");
    assert.match(csp, /mpc\.transactiongateway\.com/);
    assert.doesNotMatch(csp, /nmi\.com|networkmerchants\.com/);
  });

  it("sandbox allows the NMI sandbox and not Merchant Pay Connect", () => {
    const csp = contentSecurityPolicy("sandbox");
    assert.match(csp, /sandbox\.nmi\.com/);
    assert.doesNotMatch(csp, /transactiongateway\.com|secure\.nmi\.com|networkmerchants\.com/);
  });
});
