-- SPRINT-6: staff PIN lockout fields, kitchen queue index, order status event log

ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "failedPinAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Order_status_paidAt_idx" ON "Order"("status", "paidAt");

CREATE TABLE IF NOT EXISTS "OrderStatusEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" "OrderStatus" NOT NULL,
    "toStatus" "OrderStatus" NOT NULL,
    "sessionId" TEXT,
    "userId" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderStatusEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OrderStatusEvent_orderId_createdAt_idx" ON "OrderStatusEvent"("orderId", "createdAt");
CREATE INDEX IF NOT EXISTS "OrderStatusEvent_sessionId_idx" ON "OrderStatusEvent"("sessionId");

ALTER TABLE "OrderStatusEvent" DROP CONSTRAINT IF EXISTS "OrderStatusEvent_orderId_fkey";
ALTER TABLE "OrderStatusEvent" ADD CONSTRAINT "OrderStatusEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderStatusEvent" DROP CONSTRAINT IF EXISTS "OrderStatusEvent_sessionId_fkey";
ALTER TABLE "OrderStatusEvent" ADD CONSTRAINT "OrderStatusEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AdminSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
