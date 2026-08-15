-- SPRINT-11: record each scheduled reconciliation pass (one row per business date)

CREATE TABLE IF NOT EXISTS "ReconciliationRun" (
    "id" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL,
    "findingCount" INTEGER NOT NULL,
    "findings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconciliationRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReconciliationRun_businessDate_key" ON "ReconciliationRun"("businessDate");
CREATE INDEX IF NOT EXISTS "ReconciliationRun_ranAt_idx" ON "ReconciliationRun"("ranAt");
