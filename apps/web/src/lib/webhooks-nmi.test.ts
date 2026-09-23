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
import { POST } from "../app/(api)/api/v1/webhooks/nmi/route";

const PREFIX = "s182-";
const SIGNING_KEY = "test-webhook-signing-key";
const ORIGINAL_ENV = { ...env };

async function cleanup(): Promise<void> {
  await prisma.processorWebhookEvent.deleteMany({ where: { eventId: { startsWith: PREFIX } } });
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
});
