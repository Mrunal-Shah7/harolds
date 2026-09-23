// SPRINT-18.2: where every gateway operation is addressed, and webhook signature verification over
// raw bytes. `fetch` is stubbed for the whole file — no request leaves the process.
// SPRINT-18.3: the sale request carries the billing ZIP; every outcome carries its attempt
// record; no token, ZIP, PAN or key reaches a log line.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { env, nmiGatewayUrls, type NmiEnvironment } from "@harolds/config";
import {
  createPayment,
  findPaymentByOrderId,
  getPayment,
  getRefund,
  refundPayment,
  verifyWebhookSignature,
} from "./client";

const ORIGINAL_ENV = { ...env };
const ORIGINAL_FETCH = globalThis.fetch;
const SIGNING_KEY = "test-webhook-signing-key";

type Captured = { url: string; body: URLSearchParams };
let captured: Captured[] = [];
/** SPRINT-18.3: what the stubbed Payment API answers next. */
let transactAnswer: { status: number; body: string } = {
  status: 200,
  body: "response=1&responsetext=SUCCESS&transactionid=t1&response_code=100",
};
let transactThrows: Error | null = null;

const QUERY_XML =
  "<nm_response><transaction><transaction_id>t1</transaction_id><order_id>o1</order_id>" +
  "<condition>complete</condition><action><action_type>sale</action_type><amount>1.00</amount>" +
  "<date>20260924010000</date></action></transaction></nm_response>";

function useEnvironment(environment: NmiEnvironment): void {
  env.NMI_ENVIRONMENT = environment;
  const suffix = environment === "production" ? "LIVE" : "SANDBOX";
  env[`NMI_SECURITY_KEY_${suffix}`] = `test-security-${suffix}`;
  env[`NMI_TOKENIZATION_KEY_${suffix}`] = `test-tokenization-${suffix}`;
  env[`NMI_WEBHOOK_SIGNING_KEY_${suffix}`] = SIGNING_KEY;
}

beforeEach(() => {
  captured = [];
  transactAnswer = { status: 200, body: "response=1&responsetext=SUCCESS&transactionid=t1&response_code=100" };
  transactThrows = null;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    captured.push({ url, body: new URLSearchParams(String(init?.body ?? "")) });
    if (url.endsWith("/query.php")) return new Response(QUERY_XML, { status: 200 });
    if (transactThrows) throw transactThrows;
    return new Response(transactAnswer.body, { status: transactAnswer.status });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  Object.assign(env, ORIGINAL_ENV);
  mock.restoreAll();
});

describe("gateway addressing", () => {
  for (const environment of ["sandbox", "production"] as const) {
    it(`${environment}: sale, refund and void go to the Payment API; lookups to the Query API`, async () => {
      useEnvironment(environment);
      const { transactUrl, queryUrl } = nmiGatewayUrls(environment);

      await createPayment({
        paymentToken: "tok",
        amountCents: 100,
        correlationId: "c",
        orderId: "o1",
        orderReference: "HC-1",
      });
      await refundPayment({ paymentId: "t1", amountCents: 100, correlationId: "c" });
      await refundPayment({ paymentId: "t1", amountCents: 100, correlationId: "c", void: true });
      await getPayment("t1");
      await findPaymentByOrderId("o1");
      await getRefund("t1");

      assert.deepEqual(
        captured.map((c) => [c.body.get("type") ?? "query", c.url]),
        [
          ["sale", transactUrl],
          ["refund", transactUrl],
          ["void", transactUrl],
          ["query", queryUrl],
          ["query", queryUrl],
          ["query", queryUrl],
        ],
      );
      // The security key of the SAME environment travels with every request.
      const suffix = environment === "production" ? "LIVE" : "SANDBOX";
      assert.ok(captured.every((c) => c.body.get("security_key") === `test-security-${suffix}`));
    });
  }
});

function sign(nonce: string, body: Buffer, key = SIGNING_KEY): string {
  const digest = createHmac("sha256", key).update(`${nonce}.`).update(body).digest("hex");
  return `t=${nonce},s=${digest}`;
}

function captureLogs(): string[] {
  const lines: string[] = [];
  for (const method of ["info", "warn", "error", "debug", "log"] as const) {
    mock.method(console, method, (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
  }
  return lines;
}

describe("webhook signature", () => {
  beforeEach(() => useEnvironment("sandbox"));

  const body = Buffer.from('{"event_id":"e1","event_type":"transaction.sale.success"}', "utf8");

  it("verifies a valid signature over the raw bytes", async () => {
    assert.equal(await verifyWebhookSignature({ body, signatureHeader: sign("f3c1e9a2b7d84c15", body) }), true);
  });

  it("verifies bytes that a UTF-8 decode would change (BOM, invalid sequence)", async () => {
    const raw = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body, Buffer.from([0xff])]);
    const header = sign("n1", raw);
    assert.equal(await verifyWebhookSignature({ body: raw, signatureHeader: header }), true);
    // The defect this replaces: HMAC over the decoded text is a different digest.
    const decoded = Buffer.from(new TextDecoder().decode(raw), "utf8");
    assert.notDeepEqual(decoded, raw);
    assert.equal(await verifyWebhookSignature({ body: decoded, signatureHeader: header }), false);
  });

  it("rejects a modified body", async () => {
    const header = sign("n1", body);
    const tampered = Buffer.from(body.toString("utf8").replace("sale", "void"), "utf8");
    assert.equal(await verifyWebhookSignature({ body: tampered, signatureHeader: header }), false);
  });

  it("rejects a signature made with a different key", async () => {
    assert.equal(await verifyWebhookSignature({ body, signatureHeader: sign("n1", body, "other-key") }), false);
  });

  it("rejects a malformed header", async () => {
    assert.equal(await verifyWebhookSignature({ body, signatureHeader: "s=abc" }), false);
    assert.equal(await verifyWebhookSignature({ body, signatureHeader: "garbage" }), false);
  });

  it("treats t= as a nonce: an old-looking value is not rejected on age", async () => {
    // NMI's t= is a random nonce. A 'stale timestamp' check would reject every real delivery.
    assert.equal(await verifyWebhookSignature({ body, signatureHeader: sign("1000000000", body) }), true);
  });

  it("logs why verification failed without the header, nonce, digest, key or body", async () => {
    const nonce = "nonce-value-7c1d";
    const header = sign(nonce, body);
    const digest = header.split("s=")[1]!;
    const tampered = Buffer.from("{}", "utf8");
    const lines = captureLogs();
    await verifyWebhookSignature({ body: tampered, signatureHeader: header });
    await verifyWebhookSignature({ body, signatureHeader: "t=lonenonce9f2" });
    const text = lines.join("\n");
    assert.match(text, /"reason":"digest_mismatch"/);
    assert.match(text, /"reason":"malformed_header"/);
    assert.match(text, /"bodyBytes":2/);
    for (const secret of [SIGNING_KEY, nonce, digest, "event_type", "lonenonce9f2"]) {
      assert.equal(text.includes(secret), false, `log must not contain ${secret}`);
    }
  });
});

describe("SPRINT-18.3: the sale request and what comes back", () => {
  const TOKEN = "tok-6c1f-UNIQUE-PAYMENT-TOKEN";
  const ZIP = "73951";
  const sale = (billingZip: string | null = ZIP) =>
    createPayment({
      paymentToken: TOKEN,
      billingZip,
      amountCents: 174,
      correlationId: "pay:o1",
      orderId: "o1",
      orderReference: "o1",
    });

  beforeEach(() => useEnvironment("production"));

  it("sends the billing ZIP as the Payment API's `zip`, next to the token", async () => {
    await sale();
    const body = captured[0]!.body;
    assert.equal(body.get("type"), "sale");
    assert.equal(body.get("zip"), ZIP);
    assert.equal(body.get("payment_token"), TOKEN);
    assert.equal(captured[0]!.url, nmiGatewayUrls("production").transactUrl);
  });

  it("omits `zip` entirely when none was given, rather than sending an empty one", async () => {
    await sale(null);
    assert.equal(captured[0]!.body.has("zip"), false);
  });

  it("records the gateway's codes on an approval — including AVS and CVV — and no ZIP", async () => {
    transactAnswer = {
      status: 200,
      body: "response=1&responsetext=SUCCESS&authcode=123456&transactionid=11223344556&avsresponse=Z&cvvresponse=M&orderid=o1&type=sale&response_code=100",
    };
    const outcome = await sale();
    assert.equal(outcome.kind, "succeeded");
    assert.deepEqual(outcome.attempt, {
      gatewayEnvironment: "production",
      gatewayOrigin: nmiGatewayUrls("production").origin,
      classification: "APPROVED",
      internalReason: "APPROVED",
      gatewayResponse: "1",
      gatewayResponseCode: "100",
      gatewayResponseText: "SUCCESS",
      avsResponse: "Z",
      cvvResponse: "M",
      authCode: "123456",
      gatewayTransactionId: "11223344556",
      httpStatus: null,
    });
    assert.equal(JSON.stringify(outcome).includes(ZIP), false, "the outcome carries no ZIP");
  });

  it("201 is a decline with its own reason, the gateway's text, and a customer-safe message", async () => {
    transactAnswer = {
      status: 200,
      body: "response=2&responsetext=DECLINE&authcode=&transactionid=99887766&avsresponse=N&cvvresponse=M&orderid=o1&type=sale&response_code=201",
    };
    const outcome = await sale();
    assert.equal(outcome.kind, "declined");
    if (outcome.kind !== "declined") return;
    assert.equal(outcome.attempt.classification, "DECLINED");
    assert.equal(outcome.attempt.internalReason, "DO_NOT_HONOR");
    assert.equal(outcome.attempt.gatewayResponseCode, "201");
    assert.equal(outcome.attempt.avsResponse, "N");
    assert.equal(outcome.attempt.cvvResponse, "M");
    assert.equal(outcome.code, "CARD_DECLINED");
    assert.doesNotMatch(outcome.reason, /201|DECLINE$|do not honor/i);
  });

  it("411 is an incident, not a decline, and says nothing about the card", async () => {
    transactAnswer = { status: 200, body: "response=3&responsetext=Merchant account is inactive&response_code=411" };
    const outcome = await sale();
    assert.equal(outcome.kind, "unavailable");
    assert.equal(outcome.attempt.classification, "CONFIGURATION_FAILURE");
    assert.equal(outcome.attempt.internalReason, "MERCHANT_ACCOUNT_INACTIVE");
    if (outcome.kind === "unavailable") assert.doesNotMatch(outcome.message, /card|declin/i);
  });

  it("420 stays ambiguous (the charge may exist) but is classified as communication", async () => {
    transactAnswer = { status: 200, body: "response=3&responsetext=Communication error&response_code=420" };
    const outcome = await sale();
    assert.equal(outcome.kind, "transport_failure");
    assert.equal(outcome.attempt.classification, "COMMUNICATION_FAILURE");
  });

  it("a timeout is a communication failure with no gateway codes, never a decline", async () => {
    const err = new Error("timed out");
    err.name = "TimeoutError";
    transactThrows = err;
    const outcome = await sale();
    assert.equal(outcome.kind, "transport_failure");
    assert.equal(outcome.attempt.internalReason, "GATEWAY_TIMEOUT");
    assert.equal(outcome.attempt.gatewayResponseCode, null);
  });

  it("HTTP 429 (system-wide rate limit) is a definite incident", async () => {
    transactAnswer = { status: 429, body: "" };
    const outcome = await sale();
    assert.equal(outcome.kind, "unavailable");
    assert.equal(outcome.attempt.internalReason, "RATE_LIMITED_HTTP_429");
    assert.equal(outcome.attempt.httpStatus, 429);
  });

  it("missing local credentials is a configuration incident, and nothing is sent", async () => {
    env.NMI_SECURITY_KEY_LIVE = "";
    const outcome = await sale();
    assert.equal(outcome.kind, "unavailable");
    assert.equal(outcome.attempt.internalReason, "LOCAL_CREDENTIALS_MISSING");
    assert.equal(captured.length, 0);
  });

  it("an unmapped code is handled and logged at warn, naming the code", async () => {
    transactAnswer = { status: 200, body: "response=2&responsetext=HUH&response_code=299" };
    const lines = captureLogs();
    const outcome = await sale();
    assert.equal(outcome.kind, "declined");
    const warn = lines.find((l) => l.includes("payment.unmapped_result_code"));
    assert.ok(warn, "an unmapped code must surface");
    assert.match(warn!, /"level":"warn"/);
    assert.match(warn!, /"gatewayResponseCode":"299"/);
  });

  it("one outcome line per attempt carries the codes — and never the token, ZIP, PAN or key", async () => {
    const pan = "4111111111111111";
    for (const body of [
      "response=1&responsetext=SUCCESS&authcode=123456&transactionid=11223344556&avsresponse=Z&cvvresponse=M&response_code=100&cc_number=4xxxxxxxxxxx1111",
      "response=2&responsetext=DECLINE&transactionid=99887766&avsresponse=N&cvvresponse=M&response_code=201",
    ]) {
      transactAnswer = { status: 200, body };
      const lines = captureLogs();
      await sale();
      const outcomeLines = lines.filter((l) => l.includes('"event":"payment.outcome"'));
      assert.equal(outcomeLines.length, 1, "exactly one outcome line per attempt");
      const line = outcomeLines[0]!;
      assert.match(line, /"gatewayResponseCode":"(100|201)"/);
      assert.match(line, /"avsResult":"[ZN]"/);
      assert.match(line, /"securityCodeResult":"M"/);
      assert.match(line, /"gatewayOrigin":"https:\/\//);
      assert.match(line, /"orderReference":"o1"/);
      const everything = lines.join("\n");
      for (const secret of [TOKEN, ZIP, pan, "test-security-LIVE"]) {
        assert.equal(everything.includes(secret), false, `no log line may contain ${secret}`);
      }
      assert.match(everything, /"billingZipProvided":true/);
      mock.restoreAll();
    }
  });
});
