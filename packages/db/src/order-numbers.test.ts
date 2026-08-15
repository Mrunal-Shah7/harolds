// SPRINT-4: allocateOrderNumber — sequential, concurrent, and business-date-boundary behaviour.
// Requires a reachable DATABASE_URL (loaded from the repo root .env, same as verify.ts / seed).
// Uses far-future test-only business dates and deletes its own OrderNumberCounter rows before
// and after each test so re-running this file never collides with itself or real order data.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { prisma } from "./client";
import { allocateOrderNumber } from "./order-numbers";
import { businessDateToUtcDate } from "./business-date";

const TZ = "America/Chicago";
const RESET_HOUR = 5;

function localInstant(year: number, month: number, day: number, hour: number, minute: number): Date {
  return DateTime.fromObject({ year, month, day, hour, minute }, { zone: TZ }).toUTC().toJSDate();
}

async function allocate(
  instant: Date,
  opts: { prefix: string; startValue: number; padWidth: number; timeZone?: string; resetHour?: number },
) {
  return prisma.$transaction(
    (tx) =>
      allocateOrderNumber(tx, {
        instant,
        timeZone: opts.timeZone ?? TZ,
        resetHour: opts.resetHour ?? RESET_HOUR,
        prefix: opts.prefix,
        startValue: opts.startValue,
        padWidth: opts.padWidth,
      }),
    // Generous headroom: the concurrency test intentionally serialises ~45 callers on one row
    // lock, so a caller near the back of the queue needs more than Prisma's 5s default timeout.
    { maxWait: 15_000, timeout: 15_000 },
  );
}

async function resetCounters(businessDates: string[]): Promise<void> {
  await prisma.orderNumberCounter.deleteMany({
    where: { businessDate: { in: businessDates.map(businessDateToUtcDate) } },
  });
}

let dbAvailable = true;

before(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    dbAvailable = false;
    console.warn(
      `[order-numbers.test] DATABASE_URL unreachable — skipping DB-backed tests: ${(err as Error).message}`,
    );
  }
});

after(async () => {
  await prisma.$disconnect();
});

describe("allocateOrderNumber", () => {
  it("allocates sequential, contiguous numbers starting at the configured start value", async (t) => {
    if (!dbAvailable) return t.skip("DATABASE_URL unreachable");

    const businessDate = "2099-06-15";
    const opts = { prefix: "TST-", startValue: 500, padWidth: 4 };
    await resetCounters([businessDate]);

    try {
      const instant = localInstant(2099, 6, 15, 12, 0);
      const results = [];
      for (let i = 0; i < 5; i++) {
        results.push(await allocate(instant, opts));
      }

      assert.deepEqual(results.map((r) => r.orderSequence), [500, 501, 502, 503, 504]);
      assert.deepEqual(
        results.map((r) => r.orderNumber),
        ["TST-0500", "TST-0501", "TST-0502", "TST-0503", "TST-0504"],
      );
      for (const r of results) {
        assert.equal(r.businessDate, businessDate);
      }
    } finally {
      await resetCounters([businessDate]);
    }
  });

  it("allocates a contiguous, duplicate-free set under concurrent access", async (t) => {
    if (!dbAvailable) return t.skip("DATABASE_URL unreachable");

    const businessDate = "2099-06-16";
    const opts = { prefix: "TST-", startValue: 1000, padWidth: 4 };
    const concurrency = 45;
    await resetCounters([businessDate]);

    try {
      const instant = localInstant(2099, 6, 16, 12, 0);
      const results = await Promise.all(
        Array.from({ length: concurrency }, () => allocate(instant, opts)),
      );

      const sequences = results.map((r) => r.orderSequence);
      const unique = new Set(sequences);

      assert.equal(sequences.length, concurrency, "expected one allocation per concurrent caller");
      assert.equal(unique.size, concurrency, "expected no duplicate order sequences under concurrency");

      const sorted = [...unique].sort((a, b) => a - b);
      assert.equal(sorted[0], opts.startValue, "first allocated sequence must be the configured start value");
      assert.equal(sorted[sorted.length - 1], opts.startValue + concurrency - 1);
      for (let i = 0; i < sorted.length; i++) {
        assert.equal(sorted[i], opts.startValue + i, `expected contiguous sequence at index ${i} (no gaps)`);
      }

      for (const r of results) {
        assert.equal(r.businessDate, businessDate);
        assert.equal(r.orderNumber, `TST-${String(r.orderSequence).padStart(4, "0")}`);
      }
    } finally {
      await resetCounters([businessDate]);
    }
  });

  it("rolls to the previous business date just before the reset hour and the current date just after", async (t) => {
    if (!dbAvailable) return t.skip("DATABASE_URL unreachable");

    const beforeDate = "2099-06-30";
    const afterDate = "2099-07-01";
    const opts = { prefix: "TST-", startValue: 1, padWidth: 3 };
    await resetCounters([beforeDate, afterDate]);

    try {
      // 04:59 local, reset hour 05:00 -> belongs to the previous calendar date.
      const beforeReset = localInstant(2099, 7, 1, 4, 59);
      const beforeResult = await allocate(beforeReset, opts);
      assert.equal(beforeResult.businessDate, beforeDate);
      assert.equal(beforeResult.orderSequence, opts.startValue);
      assert.equal(beforeResult.orderNumber, "TST-001");

      // 05:00 local, exactly at reset hour -> belongs to the current calendar date, and is a
      // brand-new counter (independent of the previous date's), so it also starts at startValue.
      const afterReset = localInstant(2099, 7, 1, 5, 0);
      const afterResult = await allocate(afterReset, opts);
      assert.equal(afterResult.businessDate, afterDate);
      assert.equal(afterResult.orderSequence, opts.startValue);
      assert.equal(afterResult.orderNumber, "TST-001");

      assert.notEqual(beforeResult.businessDate, afterResult.businessDate);

      // A second allocation on the "before" date continues from where it left off (still gap-free).
      const secondBefore = await allocate(localInstant(2099, 6, 30, 20, 0), opts);
      assert.equal(secondBefore.businessDate, beforeDate);
      assert.equal(secondBefore.orderSequence, opts.startValue + 1);
    } finally {
      await resetCounters([beforeDate, afterDate]);
    }
  });

  it("composes the order number from prefix and zero-padded sequence per padWidth", async (t) => {
    if (!dbAvailable) return t.skip("DATABASE_URL unreachable");

    const businessDate = "2099-08-01";
    await resetCounters([businessDate]);
    const instant = localInstant(2099, 8, 1, 12, 0);

    try {
      const short = await allocate(instant, { prefix: "HC-", startValue: 7, padWidth: 3 });
      assert.equal(short.orderNumber, "HC-007");

      await resetCounters([businessDate]);
      const wide = await allocate(instant, { prefix: "OAKLAWN#", startValue: 42, padWidth: 6 });
      assert.equal(wide.orderNumber, "OAKLAWN#000042");

      // padWidth never truncates — a sequence wider than padWidth prints in full.
      await resetCounters([businessDate]);
      const overflow = await allocate(instant, { prefix: "HC-", startValue: 12345, padWidth: 3 });
      assert.equal(overflow.orderNumber, "HC-12345");
    } finally {
      await resetCounters([businessDate]);
    }
  });
});
