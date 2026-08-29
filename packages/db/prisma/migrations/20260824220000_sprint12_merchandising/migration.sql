-- SPRINT-12: store messaging, trading overrides, audit details for before/after.
ALTER TABLE "StoreConfig" ADD COLUMN IF NOT EXISTS "closedMessage" TEXT;
ALTER TABLE "StoreConfig" ADD COLUMN IF NOT EXISTS "prepEstimatePhrase" TEXT DEFAULT 'about {minutes} min';
ALTER TABLE "StoreConfig" ADD COLUMN IF NOT EXISTS "announcementText" TEXT;
ALTER TABLE "StoreConfig" ADD COLUMN IF NOT EXISTS "announcementStartsAt" TIMESTAMP(3);
ALTER TABLE "StoreConfig" ADD COLUMN IF NOT EXISTS "announcementEndsAt" TIMESTAMP(3);

CREATE TYPE "TradingOverrideKind" AS ENUM (
  'CLOSE_EARLY',
  'OPEN_LATE',
  'CLOSED_REST_OF_DAY',
  'OPEN_ANYWAY'
);

CREATE TABLE IF NOT EXISTS "TradingOverride" (
  "id" TEXT NOT NULL,
  "businessDate" DATE NOT NULL,
  "kind" "TradingOverrideKind" NOT NULL,
  "openTime" TEXT,
  "closeTime" TEXT,
  "customerMessage" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "cancelledAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TradingOverride_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TradingOverride_businessDate_expiresAt_idx"
  ON "TradingOverride"("businessDate", "expiresAt");
CREATE INDEX IF NOT EXISTS "TradingOverride_cancelledAt_idx"
  ON "TradingOverride"("cancelledAt");

ALTER TABLE "AdminAuditLog" ADD COLUMN IF NOT EXISTS "details" JSONB;
