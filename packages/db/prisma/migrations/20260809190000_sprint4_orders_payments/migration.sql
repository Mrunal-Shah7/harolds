-- AlterEnum
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'ALERT_MANAGER_PAYMENT_DISCREPANCY';

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'ABANDONED';

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'UNKNOWN';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "clientIdempotencyKey" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "lookupToken" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentFailureReason" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "tipRateBps" INTEGER;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cartFingerprint" TEXT;
ALTER TABLE "Order" ALTER COLUMN "orderNumber" DROP NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "orderSequence" DROP NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "businessDate" DROP NOT NULL;

-- AlterTable
ALTER TABLE "OrderLine" ADD COLUMN IF NOT EXISTS "customerNote" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProcessorWebhookEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "outcome" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "orderId" TEXT,
    "lastError" TEXT,
    CONSTRAINT "ProcessorWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProcessorRefund" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "clientIdempotencyKey" TEXT NOT NULL,
    "processorRefundId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProcessorRefund_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProcessorWebhookEvent_eventId_key" ON "ProcessorWebhookEvent"("eventId");
CREATE INDEX IF NOT EXISTS "ProcessorWebhookEvent_orderId_idx" ON "ProcessorWebhookEvent"("orderId");
CREATE INDEX IF NOT EXISTS "ProcessorWebhookEvent_receivedAt_idx" ON "ProcessorWebhookEvent"("receivedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "ProcessorRefund_clientIdempotencyKey_key" ON "ProcessorRefund"("clientIdempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "ProcessorRefund_processorRefundId_key" ON "ProcessorRefund"("processorRefundId");
CREATE INDEX IF NOT EXISTS "ProcessorRefund_orderId_idx" ON "ProcessorRefund"("orderId");
CREATE UNIQUE INDEX IF NOT EXISTS "Order_lookupToken_key" ON "Order"("lookupToken");
CREATE UNIQUE INDEX IF NOT EXISTS "Order_clientIdempotencyKey_key" ON "Order"("clientIdempotencyKey");
CREATE INDEX IF NOT EXISTS "Order_processorPaymentId_idx" ON "Order"("processorPaymentId");
CREATE INDEX IF NOT EXISTS "Order_paymentStatus_createdAt_idx" ON "Order"("paymentStatus", "createdAt");

DO $$ BEGIN
 ALTER TABLE "ProcessorWebhookEvent" ADD CONSTRAINT "ProcessorWebhookEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
 ALTER TABLE "ProcessorRefund" ADD CONSTRAINT "ProcessorRefund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Backfill required keys for any leftover rows then enforce NOT NULL
UPDATE "Order" SET "lookupToken" = md5(random()::text || id) WHERE "lookupToken" IS NULL;
UPDATE "Order" SET "clientIdempotencyKey" = 'legacy-' || id WHERE "clientIdempotencyKey" IS NULL;
UPDATE "Order" SET "cartFingerprint" = 'legacy' WHERE "cartFingerprint" IS NULL;
ALTER TABLE "Order" ALTER COLUMN "lookupToken" SET NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "clientIdempotencyKey" SET NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "cartFingerprint" SET NOT NULL;
