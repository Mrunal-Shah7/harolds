-- SPRINT-5: print job backoff, reprint flag, card last4, printer heartbeat

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cardLast4" TEXT;

ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "isReprint" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "PrintJob" ALTER COLUMN "maxAttempts" SET DEFAULT 5;

DROP INDEX IF EXISTS "PrintJob_status_printerSerial_idx";
CREATE INDEX IF NOT EXISTS "PrintJob_status_printerSerial_runAfter_idx" ON "PrintJob"("status", "printerSerial", "runAfter");
CREATE INDEX IF NOT EXISTS "PrintJob_status_sentAt_idx" ON "PrintJob"("status", "sentAt");

CREATE TABLE IF NOT EXISTS "PrinterHeartbeat" (
    "printerSerial" TEXT NOT NULL,
    "lastPolledAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrinterHeartbeat_pkey" PRIMARY KEY ("printerSerial")
);
