// SPRINT-19: Apple Pay and Google Pay take the card's charge path — and nothing else.
//
// The REAL payments client against a stubbed gateway (`fetch` is replaced; no request leaves the
// process), the real claim, duplicate guard, attempt record, alert window and database. Same
// harness as payment-classification.test.ts. Runs against Postgres and does not green-skip.
import path from "node:path";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "../../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { env } from "@harolds/config";
import {
  createPendingOrderGuarded,
  getAdminOrderDetail,
  prisma,
  raisePaymentGatewayIncident,
  recordPaymentAttempt,
} from "@harolds/db";
import { createPayment, findPaymentByOrderId, toGatewayAmount } from "@harolds/payments";
import { ApiErrorCode, JobType, OrderStatus, PaymentStatus, type PaymentMethod, type QuoteResult } from "@harolds/types";
import { fail } from "./api";
import {
  chargeExistingPending,
  chargePaymentOf,
  parseCreateOrderBody,
  PAYMENT_UNAVAILABLE_MESSAGE,
  WALLET_TOTAL_CHANGED_MESSAGE,
  type ChargeDeps,
  type ChargePayment,
} from "./checkout";

const PREFIX = "s19-wallet-";
const PHONE = "+17085550937";
const SECURITY_KEY = "test-s19-security-key";
const FUTURE_BUSINESS_DATE = "2099-09-19";
const FUTURE_NOW = new Date("2099-09-19T18:00:00.000Z");
const TOTAL_CENTS = 1840;
const TOTAL = "18.40";
const ORIGINAL_ENV = { ...env };
const ORIGINAL_FETCH = globalThis.fetch;

const APPROVED = (txn: string) =>
  `response=1&responsetext=SUCCESS&authcode=654321&transactionid=${txn}&avsresponse=Z&cvvresponse=&orderid=&type=sale&response_code=100`;
const DECLINED_201 =
  "response=2&responsetext=DECLINE&authcode=&transactionid=12555919001&avsresponse=N&cvvresponse=&orderid=&type=sale&response_code=201";
const INACTIVE_411 =
  "response=3&responsetext=Merchant account is inactive&authcode=&transactionid=&avsresponse=&cvvresponse=&orderid=&type=sale&response_code=411";

let gatewayAnswer = APPROVED("12555919000");
const sentBodies: URLSearchParams[] = [];
/** Only Payment API sales count: the Query API is not a charge. */
const sales = () => sentBodies.filter((b) => b.get("type") === "sale");

const DEPS: ChargeDeps = {
  createPayment,
  findPaymentByOrderId,
  recordPaymentAttempt,
  raisePaymentGatewayIncident,
  now: () => FUTURE_NOW.getTime(),
};

async function cleanup(): Promise<void> {
  const orders = await prisma.order.findMany({
    where: { OR: [{ clientIdempotencyKey: { startsWith: PREFIX } }, { customerPhone: PHONE }] },
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
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.orderNumberCounter.deleteMany({
    where: { businessDate: new Date(`${FUTURE_BUSINESS_DATE}T00:00:00.000Z`) },
  });
}

let menuItemId: string;

before(async () => {
  await prisma.$queryRaw`SELECT 1`;
  await cleanup();
  const item = await prisma.menuItem.findFirst({ where: { isActive: true } });
  assert.ok(item, "the local database must be seeded — run pnpm db:seed:menu");
  menuItemId = item.id;
  env.NMI_ENVIRONMENT = "sandbox";
  env.NMI_SECURITY_KEY_SANDBOX = SECURITY_KEY;
  env.NMI_TOKENIZATION_KEY_SANDBOX = "test-s19-tokenization";
  env.NMI_WEBHOOK_SIGNING_KEY_SANDBOX = "test-s19-signing";
  env.PAYMENTS_APPLE_PAY_ENABLED = "true";
  env.PAYMENTS_GOOGLE_PAY_ENABLED = "true";
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = new URLSearchParams(String(init?.body ?? ""));
    sentBodies.push(body);
    // A slow gateway, so concurrent requests genuinely overlap.
    await new Promise((resolve) => setTimeout(resolve, 50));
    return new Response(body.get("type") === "sale" ? gatewayAnswer : "", { status: 200 });
  }) as typeof fetch;
});

after(async () => {
  globalThis.fetch = ORIGINAL_FETCH;
  Object.assign(env, ORIGINAL_ENV);
  await cleanup();
  await prisma.$disconnect();
});

beforeEach(() => {
  sentBodies.length = 0;
  gatewayAnswer = APPROVED(`12555919${String(Math.floor(Math.random() * 1e3)).padStart(3, "0")}`);
});
afterEach(() => mock.restoreAll());

let seq = 0;
function quote(): QuoteResult {
  return {
    subtotalCents: 1500,
    taxCents: 150,
    totalCents: TOTAL_CENTS,
    taxRateBps: 1000,
    taxAppliedPreDiscount: true,
    orderable: true,
    blockingReasons: [],
    estimatedReadyAt: new Date("2099-01-01T00:00:00.000Z").toISOString(),
    tip: { type: "preset", presetIndex: 1, rateBps: 1270, tipCents: 190 },
    lines: [
      {
        itemId: menuItemId,
        snapshot: {
          quantity: 1,
          itemName: "Half dark",
          boardLabel: "1/2 DARK",
          baseUnitPriceCents: 1500,
          modifierTotalCents: 0,
          effectiveUnitPriceCents: 1500,
          lineTotalCents: 1500,
          selectedModifiers: [],
          customerNote: null,
        },
      },
    ],
  } as unknown as QuoteResult;
}

/** What POST /orders does after pricing: the Sprint 16 guard creates (or finds) the pending order. */
async function pendingOrder(opts: { fingerprint?: string; key?: string } = {}) {
  seq += 1;
  const guarded = await createPendingOrderGuarded({
    quote: quote(),
    customer: { firstName: "Test", lastName: "Wallet", phoneE164: PHONE, email: "s19@example.com" },
    clientIdempotencyKey: opts.key ?? `${PREFIX}${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`,
    cartFingerprint: opts.fingerprint ?? `fp-s19-${seq}-${Math.random().toString(36).slice(2, 8)}`,
    customerNote: null,
    guardWindowMs: 180_000,
  });
  return guarded;
}

function walletPayment(method: PaymentMethod, token: string, displayed = TOTAL): ChargePayment {
  return {
    paymentToken: token,
    billingZip: null,
    paymentMethod: method,
    walletDisplayedAmount: method === "card" ? null : displayed,
    cardBrand: "visa",
  };
}

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

describe("one charge path", () => {
  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".next" || name === "generated") continue;
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) sourceFiles(full, out);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
    }
    return out;
  }
  const files = [path.join(rootDir, "apps/web/src"), path.join(rootDir, "packages")].flatMap((d) => sourceFiles(d));
  const hits = (pattern: RegExp) =>
    files
      .filter((f) => pattern.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(rootDir, f).replace(/\\/g, "/"));

  it("there is exactly one sale request in the repository, and no wallet-specific one", () => {
    assert.deepEqual(hits(/type: "sale"/), ["packages/payments/src/client.ts"]);
    assert.deepEqual(hits(/applepay_payment_data|googlepay_payment_data|decrypted_(apple|google)pay_data/), []);
    assert.deepEqual(hits(/\bcreatePayment\(\{/), ["apps/web/src/lib/checkout.ts"]);
  });

  it("a wallet sale sends the card's request: same fields, same values, minus only the card-only ZIP", async () => {
    const card = await pendingOrder();
    await chargeExistingPending(card.order, { ...walletPayment("card", "tok-card"), billingZip: "60633" }, DEPS);
    const google = await pendingOrder();
    await chargeExistingPending(google.order, walletPayment("google_pay", "tok-google"), DEPS);
    const apple = await pendingOrder();
    await chargeExistingPending(apple.order, walletPayment("apple_pay", "tok-apple"), DEPS);

    const [c, g, a] = sales();
    assert.ok(c && g && a);
    const shape = (b: URLSearchParams) =>
      Object.fromEntries([...b.entries()].filter(([k]) => !["payment_token", "orderid", "order_description", "security_key"].includes(k)));
    assert.equal(c.get("zip"), "60633");
    const { zip: _zip, ...cardShape } = shape(c);
    assert.deepEqual(shape(g), cardShape, "Google Pay: the card request, without the ZIP");
    assert.deepEqual(shape(a), cardShape, "Apple Pay: the card request, without the ZIP");
    assert.equal(g.get("payment_token"), "tok-google", "the wallet token rides in payment_token");
    assert.equal(a.get("payment_token"), "tok-apple");
    for (const b of [g, a]) {
      assert.equal(b.has("zip"), false, "the wallet's own postal code is used; none is sent");
      assert.equal(b.get("amount"), TOTAL);
    }
  });
});

describe("the amount the sheet showed is the amount charged, or nothing is", () => {
  it("a mismatched displayed amount is refused BEFORE any gateway call, and the claim is released", async () => {
    for (const method of ["apple_pay", "google_pay"] as const) {
      const { order } = await pendingOrder();
      sentBodies.length = 0;
      const lines = captureLogs();
      const result = await chargeExistingPending(order, walletPayment(method, `tok-${method}`, "15.10"), DEPS);
      mock.restoreAll();

      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.code, ApiErrorCode.INTERNAL_ERROR, "an internal error, not a decline");
      assert.equal(result.message, WALLET_TOTAL_CHANGED_MESSAGE);
      assert.equal(result.details?.reason, "WALLET_AMOUNT_MISMATCH");
      assert.equal(result.details?.retryable, true);
      assert.equal(fail(result.code, result.message).status, 500);
      assert.equal(sentBodies.length, 0, "the gateway was never called");

      const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      assert.equal(after.chargeClaimedAt, null, "claim released — the same order can be retried");
      assert.equal(after.paymentStatus, PaymentStatus.PENDING, "not failed, not partly paid");
      assert.equal(after.status, OrderStatus.AWAITING_PAYMENT);
      assert.equal(await prisma.paymentAttempt.count({ where: { orderId: order.id } }), 0);
      assert.equal(lines.filter((l) => l.includes('"event":"checkout.wallet_amount_mismatch"')).length, 1);

      // The retry, with the sheet re-configured to the server's total, charges once.
      const retry = await chargeExistingPending(after as typeof order, walletPayment(method, `tok-${method}-2`), DEPS);
      assert.equal(retry.ok, true);
      assert.equal(sales().length, 1);
      assert.equal(sales()[0]!.get("amount"), TOTAL);
    }
  });

  it("a wallet with no displayed amount is refused too; a card never needs one", async () => {
    const { order } = await pendingOrder();
    const result = await chargeExistingPending(order, { ...walletPayment("apple_pay", "tok-x"), walletDisplayedAmount: null }, DEPS);
    assert.equal(result.ok === false && result.details?.reason, "WALLET_AMOUNT_MISMATCH");
    assert.equal(sentBodies.length, 0);
  });

  it("the comparison uses the sale's own formatter", () => {
    assert.equal(toGatewayAmount(TOTAL_CENTS), TOTAL);
  });
});

describe("Sprint 16's guards cover wallets", () => {
  it("THE SAME WALLET TOKEN SUBMITTED TWICE AT ONCE PRODUCES EXACTLY ONE SALE", async () => {
    // Two identical POST /orders racing: same cart, same phone, same key, same token.
    const key = `${PREFIX}double-${Date.now()}`;
    const fingerprint = `fp-s19-double-${Date.now()}`;
    const request = async () => {
      const guarded = await pendingOrder({ key, fingerprint });
      return chargeExistingPending(guarded.order, walletPayment("google_pay", "tok-google-DOUBLE"), DEPS);
    };
    const [a, b] = await Promise.all([request(), request()]);

    assert.equal(sales().length, 1, "one sale reached the gateway");
    const orders = await prisma.order.findMany({ where: { cartFingerprint: fingerprint } });
    assert.equal(orders.length, 1, "one order");
    assert.equal([a, b].filter((r) => r.ok).length >= 1, true, "the winner succeeded");
    const loser = [a, b].find((r) => !r.ok || r.replay);
    assert.ok(loser, "the other request did not charge");
    const attempts = await prisma.paymentAttempt.findMany({ where: { orderId: orders[0]!.id } });
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0]!.paymentMethod, "google_pay");
  });

  it("and sequentially: a replayed wallet submission after success is a replay, not a sale", async () => {
    const key = `${PREFIX}seq-${Date.now()}`;
    const fingerprint = `fp-s19-seq-${Date.now()}`;
    const first = await pendingOrder({ key, fingerprint });
    const one = await chargeExistingPending(first.order, walletPayment("apple_pay", "tok-apple-SEQ"), DEPS);
    assert.equal(one.ok, true);
    const second = await pendingOrder({ key, fingerprint });
    assert.equal(second.kind, "existing");
    const two = await chargeExistingPending(second.order, walletPayment("apple_pay", "tok-apple-SEQ"), DEPS);
    assert.equal(two.ok && two.replay, true);
    assert.equal(sales().length, 1);
  });
});

describe("18.3's classification is identical for Card, Apple Pay and Google Pay", () => {
  beforeEach(async () => {
    await prisma.backgroundJob.deleteMany({ where: { type: JobType.ALERT_MANAGER_PAYMENT_GATEWAY_FAILURE } });
  });

  const METHODS = ["card", "apple_pay", "google_pay"] as const;

  it("201 → 402 PAYMENT_DECLINED with the mapped message, no alert, recorded per method", async () => {
    const results = [];
    for (const method of METHODS) {
      gatewayAnswer = DECLINED_201;
      const { order } = await pendingOrder();
      const result = await chargeExistingPending(order, walletPayment(method, `tok-201-${method}`), DEPS);
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.code, ApiErrorCode.PAYMENT_DECLINED);
      assert.equal(fail(result.code, result.message).status, 402);
      const [attempt] = await prisma.paymentAttempt.findMany({ where: { orderId: order.id } });
      assert.equal(attempt?.classification, "DECLINED");
      assert.equal(attempt?.internalReason, "DO_NOT_HONOR");
      assert.equal(attempt?.paymentMethod, method);
      results.push({ code: result.code, message: result.message, details: result.details });
    }
    assert.deepEqual(results[1], results[0], "Apple Pay decline == card decline");
    assert.deepEqual(results[2], results[0], "Google Pay decline == card decline");
    assert.equal(await gatewayIncidentAlerts(), 0);
  });

  for (const method of METHODS) {
    it(`411 → 503 PAYMENT_UNAVAILABLE and exactly ONE alert (${method})`, async () => {
      gatewayAnswer = INACTIVE_411;
      const orders = [await pendingOrder(), await pendingOrder()];
      for (const { order } of orders) {
        const result = await chargeExistingPending(order, walletPayment(method, `tok-411-${method}`), DEPS);
        assert.equal(result.ok === false && result.code, ApiErrorCode.PAYMENT_UNAVAILABLE);
        if (result.ok) return;
        assert.equal(fail(result.code, result.message).status, 503, "a server-side status");
        assert.equal(result.message, PAYMENT_UNAVAILABLE_MESSAGE);
        const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
        assert.equal(after.chargeClaimedAt, null);
        assert.equal(after.paymentStatus, PaymentStatus.PENDING);
      }
      assert.equal(await gatewayIncidentAlerts(), 1, "one outage, one alert");
    });
  }
});

describe("records: the method is kept, and nothing the wallet collected is", () => {
  // Unique strings a wallet callback would carry. None may appear in any table or log line.
  const CONTACT = {
    firstName: "Zyxwallet",
    lastName: "Qqcontact",
    address1: "917 Walletstreet Ln",
    postalCode: "99417",
    city: "Walletville",
    email: "zyx.wallet@example.invalid",
    phone: "5559917001",
  };
  const TOKEN = "tok-s19-UNIQUE-WALLET-TOKEN";
  const CRYPTOGRAM = "AgAAAAAAABkSZ19cryptogram==";
  const TYPED_ZIP = "60999";

  it("persists the method and brand, shows them in admin, and stores/logs no token, ZIP or contact data", async () => {
    const needles = [TOKEN, CRYPTOGRAM, TYPED_ZIP, ...Object.values(CONTACT)];
    const before = await Promise.all(needles.map(rowsContaining));

    // A misbehaving client that sends everything: the wallet's contact block, a cryptogram, a ZIP.
    const body = {
      cart: { lines: [{ itemId: menuItemId, quantity: 1, selectedOptionIds: [] }] },
      customer: { firstName: "Test", lastName: "Wallet", phone: "7085550937", email: "s19@example.com" },
      paymentToken: TOKEN,
      idempotencyKey: `${PREFIX}records-${Date.now()}`,
      billingZip: TYPED_ZIP,
      paymentMethod: "apple_pay",
      walletDisplayedAmount: TOTAL,
      cardBrand: "Visa",
      wallet: { cardDetails: "1111", cardNetwork: "visa", email: CONTACT.email, billingInfo: CONTACT, shippingInfo: CONTACT },
      billingInfo: CONTACT,
      cryptogram: CRYPTOGRAM,
    };
    const parsed = parseCreateOrderBody(body);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const request = JSON.stringify(parsed.request);
    for (const needle of [CRYPTOGRAM, TYPED_ZIP, ...Object.values(CONTACT)]) {
      assert.equal(request.includes(needle), false, `the parsed request dropped ${needle}`);
    }
    assert.equal(parsed.request.billingZip, undefined, "a typed ZIP is not carried into a wallet payment");

    const { order } = await pendingOrder();
    const lines = captureLogs();
    const result = await chargeExistingPending(order, chargePaymentOf(parsed.request), DEPS);
    mock.restoreAll();
    assert.equal(result.ok, true);

    const sent = sales()[0]!;
    assert.equal(sent.has("zip"), false);
    for (const needle of [CRYPTOGRAM, ...Object.values(CONTACT)]) {
      assert.equal(sent.toString().includes(encodeURIComponent(needle).replace(/%20/g, "+")), false, needle);
    }

    const row = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId: order.id } });
    assert.equal(row.paymentMethod, "apple_pay");
    assert.equal(row.cardBrand, "visa");
    const detail = await getAdminOrderDetail(order.id, "America/Chicago");
    assert.equal(detail!.paymentAttempts[0]!.paymentMethod, "apple_pay", "visible in admin");
    assert.equal(detail!.paymentAttempts[0]!.cardBrand, "visa");

    const afterRows = await Promise.all(needles.map(rowsContaining));
    needles.forEach((needle, i) => assert.deepEqual(afterRows[i], before[i], `no table gained ${needle}`));

    const all = lines.join("\n");
    for (const needle of [...needles, SECURITY_KEY]) assert.equal(all.includes(needle), false, `no log line carries ${needle}`);
    const outcome = lines.filter((l) => l.includes('"event":"payment.outcome"'));
    assert.equal(outcome.length, 1);
    assert.equal(JSON.parse(outcome[0]!).paymentMethod, "apple_pay", "the log line gains the method");
  });
});

describe("the request boundary", () => {
  const base = {
    cart: { lines: [{ itemId: "x", quantity: 1, selectedOptionIds: [] }] },
    customer: { firstName: "A", lastName: "B", phone: "7085551234", email: "a@example.com" },
    paymentToken: "tok",
    idempotencyKey: `${PREFIX}boundary-12345678`,
  };
  const failure = (body: unknown) => {
    const parsed = parseCreateOrderBody(body);
    return parsed.ok ? null : parsed.failure;
  };

  it("an omitted method is a card, so every existing client keeps working", () => {
    const parsed = parseCreateOrderBody({ ...base, billingZip: "60633" });
    assert.equal(parsed.ok && parsed.request.paymentMethod, "card");
    assert.equal(parsed.ok && parsed.request.billingZip, "60633");
  });

  it("refuses an unknown method, and a wallet without the amount its sheet showed", () => {
    assert.equal(failure({ ...base, paymentMethod: "venmo" })?.details?.field, "paymentMethod");
    assert.equal(failure({ ...base, paymentMethod: "google_pay" })?.details?.field, "walletDisplayedAmount");
    assert.equal(failure({ ...base, paymentMethod: "google_pay", walletDisplayedAmount: "18.4" })?.details?.field, "walletDisplayedAmount");
  });

  it("the field name does not trip — or defeat — the client-money guard", () => {
    assert.equal(failure({ ...base, paymentMethod: "google_pay", walletDisplayedAmount: TOTAL }), null);
    assert.equal(failure({ ...base, amount: "1.00" })?.details && true, true, "`amount` is still forbidden");
    assert.equal(failure({ ...base, walletPrice: "1.00" })?.message, "Client-supplied prices are not allowed.");
  });

  it("the server-side flag is the kill switch: a wallet that is off is refused before any order exists", () => {
    const saved = { ...env };
    try {
      env.PAYMENTS_GOOGLE_PAY_ENABLED = "false";
      env.PAYMENTS_APPLE_PAY_ENABLED = "false";
      for (const method of ["apple_pay", "google_pay"]) {
        const f = failure({ ...base, paymentMethod: method, walletDisplayedAmount: TOTAL });
        assert.equal(f?.code, ApiErrorCode.VALIDATION_ERROR);
        assert.equal(f?.details?.field, "paymentMethod");
      }
      assert.equal(failure({ ...base, billingZip: "60633", paymentMethod: "card" }), null, "cards unaffected");
    } finally {
      Object.assign(env, saved);
    }
  });
});
