-- SPRINT-17: payment gateway migration, Square -> NMI.
--
-- NMI has no per-request idempotency key, and this account's processor rejects `dup_seconds`,
-- so there is no gateway-side duplicate suppression to rely on. `chargeClaimedAt` is claimed
-- atomically before a sale is sent and cleared once its outcome is known; it is the only thing
-- standing between two concurrent checkout requests and a double charge.
ALTER TABLE "Order" ADD COLUMN "chargeClaimedAt" TIMESTAMP(3);

-- The sweep that finds stranded claims must not table-scan Order as it grows. Declared as a
-- plain index rather than a partial one so it matches what schema.prisma can express, and
-- `prisma migrate diff` stays clean.
CREATE INDEX "Order_chargeClaimedAt_idx" ON "Order"("chargeClaimedAt");
