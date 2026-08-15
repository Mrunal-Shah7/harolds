-- SPRINT-2: Phase 1 remediations — daily order numbering, admin identity, job alerts, item slugs.
-- Preserves StoreConfig_singleton_check (added in Sprint 1).

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('OWNER', 'MANAGER', 'STAFF');

-- AlterEnum (PostgreSQL 12+ allows multiple ADD VALUE in one transaction when not used in same txn as new uses)
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'ALERT_MANAGER_PRINT_FAILED';
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'ALERT_MANAGER_JOB_DEAD';
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'ALERT_MANAGER_ORDER_UNACKNOWLEDGED';

-- Drop global uniqueness on order number (HC-001 recurs daily by design)
DROP INDEX IF EXISTS "Order_orderNumber_key";

-- MenuItem.slug — add nullable, backfill from display name, then enforce NOT NULL + unique per category
ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "slug" TEXT;

UPDATE "MenuItem"
SET "slug" = trim(both '-' FROM lower(regexp_replace(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'), '-{2,}', '-', 'g')))
WHERE "slug" IS NULL OR "slug" = '';

ALTER TABLE "MenuItem" ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "MenuItem_categoryId_slug_key" ON "MenuItem"("categoryId", "slug");

-- Order.businessDate — no live orders in Sprint 1 DB; default then drop default
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "businessDate" DATE;
UPDATE "Order" SET "businessDate" = CURRENT_DATE WHERE "businessDate" IS NULL;
ALTER TABLE "Order" ALTER COLUMN "businessDate" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "Order_orderNumber_idx" ON "Order"("orderNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "Order_businessDate_orderSequence_key" ON "Order"("businessDate", "orderSequence");

-- Replace singleton OrderNumberCounter with per-business-date rows
DROP TABLE IF EXISTS "OrderNumberCounter";

CREATE TABLE "OrderNumberCounter" (
    "id" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "currentValue" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderNumberCounter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderNumberCounter_businessDate_key" ON "OrderNumberCounter"("businessDate");

-- StoreConfig operational fields
ALTER TABLE "StoreConfig" ADD COLUMN IF NOT EXISTS "managerAlertEmail" TEXT;
ALTER TABLE "StoreConfig" ADD COLUMN IF NOT EXISTS "managerAlertPhone" TEXT;
ALTER TABLE "StoreConfig" ADD COLUMN IF NOT EXISTS "orderNumberPadWidth" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "StoreConfig" ADD COLUMN IF NOT EXISTS "orderNumberResetHour" INTEGER NOT NULL DEFAULT 5;

-- Update numbering defaults for existing row (prefix HC-, start at 1)
UPDATE "StoreConfig"
SET "orderNumberPrefix" = 'HC-',
    "orderNumberStartValue" = 1,
    "orderNumberResetHour" = 5,
    "orderNumberPadWidth" = 3
WHERE "id" = 'default';

-- Ensure singleton check constraint still present after alterations
ALTER TABLE "StoreConfig" DROP CONSTRAINT IF EXISTS "StoreConfig_singleton_check";
ALTER TABLE "StoreConfig" ADD CONSTRAINT "StoreConfig_singleton_check" CHECK ("id" = 'default');

-- Admin identity (Sprint 6 / 8) — tables only; no auth logic in this sprint
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "pinHash" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminSession_tokenHash_key" ON "AdminSession"("tokenHash");
CREATE INDEX "AdminSession_userId_idx" ON "AdminSession"("userId");
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");

ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
