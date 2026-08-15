// SPRINT-4: gap-free, concurrency-safe daily order-number allocation.
// One OrderNumberCounter row per business date; allocation is a single atomic
// `UPDATE ... RETURNING` inside the caller's interactive transaction, so concurrent
// allocators for the same business date serialise on the row lock instead of racing.
import { randomUUID } from "node:crypto";
import type { Prisma } from "./generated/prisma";
import { resolveBusinessDate, businessDateToUtcDate } from "./business-date";

export type AllocateOrderNumberArgs = {
  /** UTC instant the order is being allocated for (usually payment-captured time). */
  instant: Date;
  /** IANA timezone the business date rolls over in (StoreConfig.timezone). */
  timeZone: string;
  /** Local hour (0-23) the business date resets at (StoreConfig.orderNumberResetHour). */
  resetHour: number;
  /** Order number prefix, e.g. "HC-" (StoreConfig.orderNumberPrefix). */
  prefix: string;
  /** First sequence number to allocate for a business date that has never had an order (StoreConfig.orderNumberStartValue). */
  startValue: number;
  /** Zero-pad width for the numeric part (StoreConfig.orderNumberPadWidth). */
  padWidth: number;
};

export type AllocatedOrderNumber = {
  /** YYYY-MM-DD business date the number was allocated under. */
  businessDate: string;
  /** Raw integer sequence — unique per (businessDate, orderSequence); sorts correctly. */
  orderSequence: number;
  /** Composed human-readable number, e.g. "HC-001". */
  orderNumber: string;
};

/**
 * Allocate the next order number for the business date containing `instant`.
 *
 * MUST be called with the `tx` client from inside an interactive
 * `prisma.$transaction(async (tx) => { ... })` block, and the caller's other writes for this
 * order (status flip, print jobs, etc.) should happen in that same transaction. The atomic
 * `UPDATE ... RETURNING` below takes a row lock on the `OrderNumberCounter` row that is held
 * until the surrounding transaction commits or rolls back — that lock is what serialises
 * concurrent callers into a contiguous, gap-free sequence for the same business date. Calling
 * this against the bare `prisma` client (outside a transaction) is not safe: the lock would be
 * released immediately after this function returns, before the caller has actually committed
 * the order that consumes the number.
 *
 * Counter semantics: `currentValue` always holds the LAST allocated sequence number for that
 * business date (not the next one). A brand-new business date's row is created with
 * `currentValue = startValue - 1` so the first-ever increment yields exactly `startValue`,
 * matching `StoreConfig.orderNumberStartValue` as the first number of the day.
 */
export async function allocateOrderNumber(
  tx: Prisma.TransactionClient,
  args: AllocateOrderNumberArgs,
): Promise<AllocatedOrderNumber> {
  const { instant, timeZone, resetHour, prefix, startValue, padWidth } = args;

  const businessDate = resolveBusinessDate(instant, timeZone, resetHour);
  const businessDateUtc = businessDateToUtcDate(businessDate);

  // Race-safe row creation: if two transactions both see "no row yet" for a fresh business
  // date, they both attempt this insert; the unique constraint on `businessDate` makes the
  // loser's insert a no-op via ON CONFLICT DO NOTHING rather than an error.
  //
  // NOTE the explicit `::date` cast on the WHERE-clause parameter below (not needed on INSERT,
  // where the target column's type already coerces the value): Postgres does not implicitly
  // treat a plain `timestamp`-typed bind parameter as equal to a `date` column even when both
  // represent the same calendar day, so an uncast comparison silently matches zero rows instead
  // of erroring — verified empirically against this schema, not merely a defensive cast.
  await tx.$executeRaw`
    INSERT INTO "OrderNumberCounter" ("id", "businessDate", "currentValue", "updatedAt")
    VALUES (${randomUUID()}, ${businessDateUtc}::date, ${startValue - 1}, NOW())
    ON CONFLICT ("businessDate") DO NOTHING
  `;

  // Atomic increment-and-read in one round trip. Postgres takes a row lock for the duration
  // of this UPDATE; inside an interactive transaction that lock survives until COMMIT/ROLLBACK,
  // so a second concurrent caller's UPDATE blocks here until the first caller's transaction
  // finishes — no two callers can ever observe or return the same `currentValue`.
  const rows = await tx.$queryRaw<{ currentValue: number }[]>`
    UPDATE "OrderNumberCounter"
    SET "currentValue" = "currentValue" + 1, "updatedAt" = NOW()
    WHERE "businessDate" = ${businessDateUtc}::date
    RETURNING "currentValue"
  `;

  const row = rows[0];
  if (!row) {
    // Should be unreachable — the insert above guarantees the row exists before the update.
    throw new Error(`Failed to allocate order number: counter row missing for business date ${businessDate}`);
  }

  const orderSequence = row.currentValue;
  const orderNumber = `${prefix}${String(orderSequence).padStart(padWidth, "0")}`;

  return { businessDate, orderSequence, orderNumber };
}
