// SPRINT-18.2: the NMI webhook route end to end — raw bytes in, verification before parsing, and
// replayed event ids absorbed. Runs against the real database (no green skip) with a test
// signing key; the events used are ones the handler ignores, so no gateway lookup is made.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import { createHmac } from "node:crypto";
import { after, afterEach, before, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { env } from "@harolds/config";
import { prisma } from "@harolds/db";
import { OrderStatus, PaymentStatus } from "@harolds/types";
import { refundOrder } from "./refunds";
import { POST } from "../app/(api)/api/v1/webhooks/nmi/route";

const PREFIX = "s182-";
const SIGNING_KEY = "test-webhook-signing-key";
const ORIGINAL_ENV = { ...env };

async function cleanup(): Promise<void> {
  await prisma.processorWebhookEvent.deleteMany({ where: { eventId: { startsWith: PREFIX } } });
  await prisma.order.deleteMany({ where: { clientIdempotencyKey: { startsWith: PREFIX } } });
}

before(async () => {
  await prisma.$queryRaw`SELECT 1`;
  await cleanup();
  env.NMI_ENVIRONMENT = "sandbox";
  env.NMI_SECURITY_KEY_SANDBOX = "test-security-key";
  env.NMI_TOKENIZATION_KEY_SANDBOX = "test-tokenization-key";
  env.NMI_WEBHOOK_SIGNING_KEY_SANDBOX = SIGNING_KEY;
});

afterEach(() => {
  mock.restoreAll();
});

after(async () => {
  Object.assign(env, ORIGINAL_ENV);
  await cleanup();
  await prisma.$disconnect();
});

function eventBytes(eventId: string, bom = false): Buffer {
  // `test.noop` is a domain the handler ignores: it is stored, never looked up at the gateway.
  const json = Buffer.from(JSON.stringify({ event_id: eventId, event_type: "test.noop", event_body: {} }), "utf8");
  return bom ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), json]) : json;
}

function signature(body: Buffer, nonce = "a1b2c3d4e5f60718"): string {
  return `t=${nonce},s=${createHmac("sha256", SIGNING_KEY).update(`${nonce}.`).update(body).digest("hex")}`;
}

type Delivery = { status: number; json: { data: { outcome?: string } } };

async function deliver(body: Buffer, header: string | null): Promise<Delivery> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (header) headers["webhook-signature"] = header;
  const response = await POST(
    new Request("http://localhost/api/v1/webhooks/nmi", { method: "POST", headers, body: new Uint8Array(body) }),
  );
  return { status: response.status, json: await response.json() };
}

async function storedCount(eventId: string): Promise<number> {
  return prisma.processorWebhookEvent.count({ where: { eventId } });
}

describe("NMI webhook route", () => {
  it("verifies over the raw bytes — a BOM-prefixed body the old text() path could not verify", async () => {
    const id = `${PREFIX}bom-${Date.now()}`;
    const body = eventBytes(id, true);
    const res = await deliver(body, signature(body));
    assert.equal(res.status, 200);
    assert.equal(res.json.data.outcome, "IGNORED");
    assert.equal(await storedCount(id), 1);
  });

  it("absorbs a replayed event id", async () => {
    const id = `${PREFIX}replay-${Date.now()}`;
    const body = eventBytes(id);
    const header = signature(body);
    const first = await deliver(body, header);
    const second = await deliver(body, header);
    assert.equal(first.json.data.outcome, "IGNORED");
    assert.equal(second.status, 200);
    assert.equal(second.json.data.outcome, "DUPLICATE");
    assert.equal(await storedCount(id), 1);
  });

  it("rejects a modified body before parsing it — nothing is stored", async () => {
    const original = eventBytes(`${PREFIX}orig-${Date.now()}`);
    const tamperedId = `${PREFIX}tampered-${Date.now()}`;
    const res = await deliver(eventBytes(tamperedId), signature(original));
    assert.equal(res.status, 401);
    assert.equal(await storedCount(tamperedId), 0);
  });

  it("rejects an unparseable body only AFTER it verifies", async () => {
    const garbage = Buffer.from("not json at all", "utf8");
    assert.equal((await deliver(garbage, "t=x,s=deadbeef")).status, 401);
    assert.equal((await deliver(garbage, signature(garbage))).status, 400);
  });

  it("rejects a missing signature header and logs the reason, not the body", async () => {
    const lines: string[] = [];
    mock.method(console, "warn", (...args: unknown[]) => lines.push(args.map(String).join(" ")));
    const id = `${PREFIX}nosig-${Date.now()}`;
    const res = await deliver(eventBytes(id), null);
    assert.equal(res.status, 401);
    assert.equal(await storedCount(id), 0);
    const text = lines.join("\n");
    assert.match(text, /"reason":"missing_header"/);
    assert.equal(text.includes(id), false);
  });

  it("does not add an admin-confirmed refund a second time when the webhook arrives", async () => {
    const { order, key } = await paidOrder();
    const refunded = await refundOrder({
      orderId: order.id,
      amountCents: 250,
      clientIdempotencyKey: `${key}-p`,
      refundPaymentFn: async ({ amountCents }) => ({
        kind: "succeeded",
        refundId: `rfd_${key}`,
        amountCents,
        status: "COMPLETED",
      }),
    });
    assert.equal(refunded.ok, true);
    if (!refunded.ok) return;

    const eventId = `${PREFIX}refund-dup-${Date.now()}`;
    const body = refundEventBytes({
      eventId,
      orderId: order.id,
      refundTransactionId: `rfd_${key}`,
      amount: "-2.50",
    });
    const res = await deliver(body, signature(body));
    assert.equal(res.status, 200);
    assert.equal(res.json.data.outcome, "ALREADY_APPLIED");

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(after.refundedCents, 250);
    assert.equal(after.paymentStatus, PaymentStatus.PARTIALLY_REFUNDED);
  });

  it("books a portal refund once and ignores a later event for the same processor id", async () => {
    const { order } = await paidOrder();
    const refundTransactionId = `rfd_portal_${order.id}`;
    const firstId = `${PREFIX}portal-a-${Date.now()}`;
    const firstBody = refundEventBytes({
      eventId: firstId,
      orderId: order.id,
      refundTransactionId,
      amount: "-4.00",
    });
    const first = await deliver(firstBody, signature(firstBody));
    assert.equal(first.status, 200);
    assert.equal(first.json.data.outcome, "PARTIAL_REFUND");

    const mid = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(mid.refundedCents, 400);

    const secondId = `${PREFIX}portal-b-${Date.now()}`;
    const secondBody = refundEventBytes({
      eventId: secondId,
      orderId: order.id,
      refundTransactionId,
      amount: "-4.00",
    });
    const second = await deliver(secondBody, signature(secondBody));
    assert.equal(second.status, 200);
    assert.equal(second.json.data.outcome, "ALREADY_APPLIED");

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(after.refundedCents, 400);
  });

  it("confirms an unconfirmed admin refund from the webhook without double-counting", async () => {
    const { order, key } = await paidOrder();
    const unknown = await refundOrder({
      orderId: order.id,
      amountCents: 250,
      clientIdempotencyKey: `${key}-u`,
      refundPaymentFn: async () => ({
        kind: "transport_failure",
        message: "timeout",
        refundId: `rfd_${key}_u`,
      }),
    });
    assert.equal(unknown.ok, false);
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).refundedCents, 0);

    const eventId = `${PREFIX}refund-confirm-${Date.now()}`;
    const body = refundEventBytes({
      eventId,
      orderId: order.id,
      refundTransactionId: `rfd_${key}_u`,
      amount: "-2.50",
    });
    const res = await deliver(body, signature(body));
    assert.equal(res.status, 200);
    assert.equal(res.json.data.outcome, "PARTIAL_REFUND");

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(after.refundedCents, 250);
    const rows = await prisma.processorRefund.findMany({ where: { orderId: order.id } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.status, "COMPLETED");
  });
});

let orderSequence = 182_000;

function refundEventBytes(input: {
  eventId: string;
  orderId: string;
  refundTransactionId: string;
  amount: string;
}): Buffer {
  return Buffer.from(
    JSON.stringify({
      event_id: input.eventId,
      event_type: "transaction.refund.success",
      event_body: {
        transaction_id: input.refundTransactionId,
        order_id: input.orderId,
        amount: input.amount,
        action: { action_type: "refund", amount: input.amount },
      },
    }),
    "utf8",
  );
}

async function paidOrder() {
  const key = `${PREFIX}${Math.random().toString(16).slice(2)}`;
  const order = await prisma.order.create({
    data: {
      orderNumber: `HC-WH-${key.slice(-4)}`,
      orderSequence: orderSequence++,
      businessDate: new Date("2099-09-25T00:00:00.000Z"),
      customerFirstName: "Webhook",
      customerLastName: "Refund",
      customerPhone: "+17085550889",
      customerEmail: "s182ref@example.com",
      subtotalCents: 800,
      taxCents: 80,
      tipCents: 120,
      totalCents: 1000,
      taxRateBps: 1010,
      taxAppliedPreDiscount: true,
      paymentStatus: PaymentStatus.CAPTURED,
      status: OrderStatus.PAID,
      paidAt: new Date(),
      processorPaymentId: `pay_${key}`,
      lookupToken: key,
      clientIdempotencyKey: key,
      cartFingerprint: key,
      lines: {
        create: [
          {
            quantity: 1,
            itemName: "2pc Dark",
            unitPriceCents: 800,
            modifierTotalCents: 0,
            effectiveUnitPriceCents: 800,
            lineTotalCents: 800,
            selectedModifiers: [],
          },
        ],
      },
    },
  });
  return { order, key };
}
