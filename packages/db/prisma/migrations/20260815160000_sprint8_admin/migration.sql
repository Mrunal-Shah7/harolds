-- SPRINT-8: admin sessions, password lockout, audit log, refund attribution, status-correction reason

ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "failedPasswordAttempts" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "AdminSession" ADD COLUMN IF NOT EXISTS "purpose" TEXT NOT NULL DEFAULT 'KITCHEN';
ALTER TABLE "AdminSession" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "AdminSession_purpose_idx" ON "AdminSession"("purpose");

ALTER TABLE "ProcessorRefund" ADD COLUMN IF NOT EXISTS "actedByUserId" TEXT;

CREATE INDEX IF NOT EXISTS "ProcessorRefund_actedByUserId_idx" ON "ProcessorRefund"("actedByUserId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProcessorRefund_actedByUserId_fkey'
  ) THEN
    ALTER TABLE "ProcessorRefund"
      ADD CONSTRAINT "ProcessorRefund_actedByUserId_fkey"
      FOREIGN KEY ("actedByUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "OrderStatusEvent" ADD COLUMN IF NOT EXISTS "reason" TEXT;

CREATE TABLE IF NOT EXISTS "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");
CREATE INDEX IF NOT EXISTS "AdminAuditLog_userId_idx" ON "AdminAuditLog"("userId");
CREATE INDEX IF NOT EXISTS "AdminAuditLog_action_idx" ON "AdminAuditLog"("action");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AdminAuditLog_userId_fkey'
  ) THEN
    ALTER TABLE "AdminAuditLog"
      ADD CONSTRAINT "AdminAuditLog_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
