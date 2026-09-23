// SPRINT-18.3: declines versus gateway incidents, end to end — the REAL payments client against a
// stubbed gateway (no request leaves the process), the real attempt record, the real alert
// window, the real database. Runs against Postgres and does not green-skip.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import { after, before, beforeEach, afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { env } from "@harolds/config";
import { getAdminOrderDetail, prisma, raisePaymentGatewayIncident, recordPaymentAttempt } from "@harolds/db";
import { createPayment, findPaymentByOrderId } from "@harolds/payments";
import { ApiErrorCode, JobType, OrderStatus, PaymentStatus } from "@harolds/types";
import { fail } from "./api";
import { chargeExistingPending, checkoutOrder, PAYMENT_UNAVAILABLE_MESSAGE, type ChargeDeps } from "./checkout";

const PREFIX = "s183-";
const ZIP = "73951";
const TOKEN = "tok-s183-UNIQUE-PAYMENT-TOKEN";
const SECURITY_KEY = "test-s183-security-key";
const FUTURE_BUSINESS_DATE = "2099-08-08";
const FUTURE_NOW = new Date("2099-08-08T18:00:00.000Z");
const ORIGINAL_ENV = { ...env };
const ORIGINAL_FETCH = globalThis.fetch;

let gatewayAnswer = "";
const sentBodies: URLSearchParams[] = [];

const DEPS: ChargeDeps = {
  createPayment,
  findPaymentByOrderId,
  recordPaymentAttempt,
  raisePaymentGatewayIncident,
  // Pinned so an approval allocates from a throwaway 2099 counter row, not today's live one.
  now: () => FUTURE_NOW.getTime(),
};

async function cleanup(): Promise<void> {
  const orders = await prisma.order.findMany({
    where: { clientIdempotencyKey: { startsWith: PREFIX } },
    select: { id: true },
  });
  const ids = orders.map((o) => o.id);
  if (ids.length > 0) {
    await prisma.printJob.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.orderStatusEvent.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.orderLine.deleteMany({ where: { orderId: { in: ids } } });
    for (const id of ids) {
      await prisma.backgroundJob.deleteMany({ where: { payload: { path: ["orderId"], equals: id } } });
    }
  }
  await prisma.order.deleteMany({ where: { clientIdempotencyKey: { startsWith: PREFIX } } });
  await prisma.orderNumberCounter.deleteMany({
    where: { businessDate: new Date(`${FUTURE_BUSINESS_DATE}T00:00:00.000Z`) },
  });
}

before(async () => {
  await prisma.$queryRaw`SELECT 1`;
  await cleanup();
  env.NMI_ENVIRONMENT = "sandbox";
  env.NMI_SECURITY_KEY_SANDBOX = SECURITY_KEY;
  env.NMI_TOKENIZATION_KEY_SANDBOX = "test-s183-tokenization";
  env.NMI_WEBHOOK_SIGNING_KEY_SANDBOX = "test-s183-signing";
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    sentBodies.push(new URLSearchParams(String(init?.body ?? "")));
    return new Response(gatewayAnswer, { status: 200 });
  }) as typeof fetch;
});

after(async () => {
  globalThis.fetch = ORIGINAL_FETCH;
  Object.assign(env, ORIGINAL_ENV);
  await cleanup();
  await prisma.$disconnect();
});

let seq = 0;
async function pendingOrder() {
  seq += 1;
  const unique = `${PREFIX}${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`;
  return prisma.order.create({
    data: {
      customerFirstName: "Test",
      customerLastName: "Customer",
      // Unique to this file; see the phone-collision note in charge-recovery.test.ts.
      customerPhone: "+17085550983",
      customerEmail: "s183@example.com",
      subtotalCents: 150,
      taxCents: 15,
      tipCents: 9,
      totalCents: 174,
      taxRateBps: 1000,
      taxAppliedPreDiscount: true,
      paymentStatus: PaymentStatus.PENDING,
      status: OrderStatus.AWAITING_PAYMENT,
      estimatedReadyAt: new Date("2099-01-01T00:00:00.000Z"),
      lookupToken: unique,
      clientIdempotencyKey: unique,
      cartFingerprint: "fp-s183",
    },
    include: { lines: true },
  });
}

const payment = { paymentToken: TOKEN, billingZip: ZIP };

async function gatewayIncidentAlerts(): Promise<number> {
  return prisma.backgroundJob.count({ where: { type: JobType.ALERT_MANAGER_PAYMENT_GATEWAY_FAILURE } });
}

/** Rows anywhere in the public schema whose text contains `needle`. */
async function rowsContaining(needle: string): Promise<Record<string, number>> {
  const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;
  const hits: Record<string, number> = {};
  for (const { table_name } of tables) {
    const [row] = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT count(*)::bigint AS n FROM "${table_name}" t WHERE t::text LIKE $1`,
      `%${needle}%`,
    );
    const n = Number(row?.n ?? 0);
    if (n > 0) hits[table_name] = n;
  }
  return hits;
}

function captureLogs(): string[] {
  const lines: string[] = [];
  for (const method of ["info", "warn", "error", "debug", "log"] as const) {
    mock.method(console, method, (...args: unknown[]) => lines.push(args.map(String).join(" ")));
  }
  return lines;
}

afterEach(() => mock.restoreAll());

describe("a gateway incident is not a decline", () => {
  beforeEach(async () => {
    // The alert window is global by design (one outage, one alert); start each case from none.
    await prisma.backgroundJob.deleteMany({ where: { type: JobType.ALERT_MANAGER_PAYMENT_GATEWAY_FAILURE } });
  });

  it("411 returns 503 PAYMENT_UNAVAILABLE and raises exactly ONE alert across several attempts", async () => {
    gatewayAnswer = "response=3&responsetext=Merchant account is inactive&authcode=&transactionid=&avsresponse=&cvvresponse=&orderid=&type=sale&response_code=411";
    const orders = [await pendingOrder(), await pendingOrder(), await pendingOrder()];

    for (const order of orders) {
      const result = await chargeExistingPending(order, payment, DEPS);
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.code, ApiErrorCode.PAYMENT_UNAVAILABLE);
      assert.equal(fail(result.code, result.message).status, 503, "a server-side status, not 402");
      assert.equal(result.message, PAYMENT_UNAVAILABLE_MESSAGE);
      assert.doesNotMatch(result.message, /card|declin/i, "the customer is not told about their card");
    }
    // The same order retried after the incident: its claim was released, so it can be.
    const again = await chargeExistingPending(orders[0]!, payment, DEPS);
    assert.equal(again.ok === false && again.code, ApiErrorCode.PAYMENT_UNAVAILABLE);

    assert.equal(await gatewayIncidentAlerts(), 1, "one outage, one alert");

    for (const order of orders) {
      const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      assert.equal(after.paymentStatus, PaymentStatus.PENDING, "not marked failed: it did not decline");
      assert.equal(after.status, OrderStatus.AWAITING_PAYMENT);
      assert.equal(after.chargeClaimedAt, null, "claim released: nothing was charged");
    }
    const attempts = await prisma.paymentAttempt.findMany({ where: { orderId: orders[0]!.id } });
    assert.equal(attempts.length, 2);
    for (const a of attempts) {
      assert.equal(a.classification, "CONFIGURATION_FAILURE");
      assert.equal(a.internalReason, "MERCHANT_ACCOUNT_INACTIVE");
      assert.equal(a.gatewayResponseCode, "411");
    }
  });

  it("201 returns 402 PAYMENT_DECLINED, raises no alert, and is recorded as a decline", async () => {
    gatewayAnswer = "response=2&responsetext=DECLINE&authcode=&transactionid=12555999001&avsresponse=N&cvvresponse=M&orderid=&type=sale&response_code=201";
    const order = await pendingOrder();
    const result = await chargeExistingPending(order, payment, DEPS);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, ApiErrorCode.PAYMENT_DECLINED);
    assert.equal(fail(result.code, result.message).status, 402);
    assert.equal(await gatewayIncidentAlerts(), 0, "a decline pages nobody");

    const [attempt] = await prisma.paymentAttempt.findMany({ where: { orderId: order.id } });
    assert.equal(attempt?.classification, "DECLINED");
    assert.equal(attempt?.internalReason, "DO_NOT_HONOR");
  });

  it("420 stays on the ambiguous path (claim kept) but still raises the alert", async () => {
    gatewayAnswer = "response=3&responsetext=Communication error&response_code=420";
    const order = await pendingOrder();
    const result = await chargeExistingPending(order, payment, DEPS);
    assert.equal(result.ok === false && result.code, ApiErrorCode.PAYMENT_FAILED);
    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.ok(after.chargeClaimedAt, "a communication failure may have charged; the claim stays");
    assert.equal(await gatewayIncidentAlerts(), 1);
  });
});

describe("records that answer the question", () => {
  it("a declined attempt: complete row, one log line, visible in the admin view", async () => {
    gatewayAnswer = "response=2&responsetext=DECLINE&authcode=&transactionid=12555999002&avsresponse=N&cvvresponse=M&orderid=&type=sale&response_code=201";
    const order = await pendingOrder();
    const lines = captureLogs();
    await chargeExistingPending(order, payment, DEPS);
    mock.restoreAll();

    const detail = await getAdminOrderDetail(order.id, "America/Chicago");
    const shown = detail!.paymentAttempts[0]!;
    assert.equal(shown.classification, "DECLINED");
    assert.equal(shown.internalReason, "DO_NOT_HONOR");
    assert.equal(shown.gatewayResponse, "2");
    assert.equal(shown.gatewayResponseCode, "201");
    assert.equal(shown.gatewayResponseText, "DECLINE");
    assert.equal(shown.avsResponse, "N");
    assert.equal(shown.cvvResponse, "M");
    assert.equal(shown.gatewayTransactionIdRedacted, "…999002");
    const row = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId: order.id } });
    assert.equal(row.gatewayTransactionId, "12555999002", "the full id is stored for matching the portal");

    const outcomeLines = lines.filter((l) => l.includes('"event":"payment.outcome"'));
    assert.equal(outcomeLines.length, 1);
    const all = lines.join("\n");
    for (const secret of [TOKEN, ZIP, SECURITY_KEY]) assert.equal(all.includes(secret), false, secret);
  });

  it("an approved sale carries the ZIP to the gateway and leaves it NOWHERE in the database", async () => {
    const zipBefore = await rowsContaining(ZIP);
    const tokenBefore = await rowsContaining(TOKEN);
    gatewayAnswer =
      "response=1&responsetext=SUCCESS&authcode=654321&transactionid=12555999003&avsresponse=Z&cvvresponse=M&orderid=&type=sale&response_code=100";
    const order = await pendingOrder();
    sentBodies.length = 0;
    const lines = captureLogs();
    const result = await chargeExistingPending(order, payment, DEPS);
    mock.restoreAll();

    assert.equal(result.ok, true, "the sale approved");
    assert.equal(sentBodies[0]?.get("zip"), ZIP, "the gateway received the ZIP");

    const row = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId: order.id } });
    assert.equal(row.classification, "APPROVED");
    assert.equal(row.avsResponse, "Z");
    assert.equal(row.cvvResponse, "M");
    assert.equal(row.authCode, "654321");
    assert.equal(row.gatewayTransactionId, "12555999003");

    assert.deepEqual(await rowsContaining(ZIP), zipBefore, "no table gained the ZIP");
    assert.deepEqual(await rowsContaining(TOKEN), tokenBefore, "no table gained the payment token");
    const all = lines.join("\n");
    for (const secret of [TOKEN, ZIP, SECURITY_KEY]) assert.equal(all.includes(secret), false, secret);
    assert.equal(lines.filter((l) => l.includes('"event":"payment.outcome"')).length, 1);
  });
});

describe("the request", () => {
  const body = (billingZip: unknown) => ({
    cart: { lines: [] },
    customer: { firstName: "A", lastName: "B", phone: "7085551234", email: "a@example.com" },
    paymentToken: "tok",
    idempotencyKey: `${PREFIX}key-12345678`,
    billingZip,
  });

  it("refuses a malformed billing ZIP with a message that says what is wrong", async () => {
    const result = await checkoutOrder(body("606"));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, ApiErrorCode.VALIDATION_ERROR);
    assert.equal(result.details?.field, "billingZip");
    assert.match(result.message, /5-digit ZIP/);
  });

  it("gets past the ZIP check with five digits or ZIP+4", async () => {
    for (const zip of ["60633", "60633-1234"]) {
      const result = await checkoutOrder(body(zip));
      // An empty cart fails LATER, on the cart — which proves the ZIP was accepted.
      assert.equal(result.ok === false && result.details?.field === "billingZip", false, zip);
    }
  });
});
