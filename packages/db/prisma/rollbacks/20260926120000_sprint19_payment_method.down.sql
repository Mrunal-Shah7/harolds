-- SPRINT-19: reverses 20260926120000_sprint19_payment_method. Drops only what it added.
-- Run by hand (psql) and then delete the migration row:
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20260926120000_sprint19_payment_method';
ALTER TABLE "PaymentAttempt" DROP COLUMN "paymentMethod", DROP COLUMN "cardBrand";
DROP TYPE "PaymentMethod";
