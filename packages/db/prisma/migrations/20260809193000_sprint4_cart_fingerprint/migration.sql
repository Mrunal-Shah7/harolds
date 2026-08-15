-- SPRINT-4: cart fingerprint column (idempotency conflict detection)
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cartFingerprint" TEXT;
UPDATE "Order" SET "cartFingerprint" = 'legacy' WHERE "cartFingerprint" IS NULL;
ALTER TABLE "Order" ALTER COLUMN "cartFingerprint" SET NOT NULL;
