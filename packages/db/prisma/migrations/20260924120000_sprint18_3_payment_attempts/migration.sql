-- SPRINT-18.3: per-attempt gateway record, the decline-vs-incident classification, and the
-- payment-gateway incident alert. Additive only: no existing column or row changes.
-- Generated with `prisma migrate diff` (see docs/SPRINT-18-3-NOTES.md §9 for why not migrate dev).

-- CreateEnum
CREATE TYPE "PaymentAttemptClassification" AS ENUM ('APPROVED', 'DECLINED', 'GATEWAY_FAILURE', 'CONFIGURATION_FAILURE', 'COMMUNICATION_FAILURE');

-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'ALERT_MANAGER_PAYMENT_GATEWAY_FAILURE';

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amountCents" INTEGER NOT NULL,
    "gatewayEnvironment" TEXT NOT NULL,
    "gatewayOrigin" TEXT NOT NULL,
    "classification" "PaymentAttemptClassification" NOT NULL,
    "internalReason" TEXT NOT NULL,
    "gatewayResponse" TEXT,
    "gatewayResponseCode" TEXT,
    "gatewayResponseText" TEXT,
    "avsResponse" TEXT,
    "cvvResponse" TEXT,
    "authCode" TEXT,
    "gatewayTransactionId" TEXT,
    "httpStatus" INTEGER,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentAttempt_orderId_createdAt_idx" ON "PaymentAttempt"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentAttempt_classification_createdAt_idx" ON "PaymentAttempt"("classification", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentAttempt_gatewayTransactionId_idx" ON "PaymentAttempt"("gatewayTransactionId");

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
