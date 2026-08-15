-- SPRINT-7: job worker columns, cancelled status, SMS suppression

ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TABLE "BackgroundJob" ADD COLUMN IF NOT EXISTS "providerMessageId" TEXT;
ALTER TABLE "BackgroundJob" ADD COLUMN IF NOT EXISTS "result" TEXT;

CREATE INDEX IF NOT EXISTS "BackgroundJob_status_lastAttemptAt_idx" ON "BackgroundJob"("status", "lastAttemptAt");

CREATE TABLE IF NOT EXISTS "SmsSuppression" (
    "phoneE164" TEXT NOT NULL,
    "suppressed" BOOLEAN NOT NULL DEFAULT true,
    "optedOutAt" TIMESTAMP(3),
    "optedInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsSuppression_pkey" PRIMARY KEY ("phoneE164")
);

CREATE TABLE IF NOT EXISTS "SmsInboundEvent" (
    "id" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "fromPhone" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsInboundEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SmsInboundEvent_providerEventId_key" ON "SmsInboundEvent"("providerEventId");
