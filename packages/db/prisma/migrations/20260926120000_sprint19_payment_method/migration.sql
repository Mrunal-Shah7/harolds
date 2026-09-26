-- SPRINT-19: the payment method (and card brand) on each sale attempt. Additive only: one enum,
-- two columns; existing rows are card attempts and take the default. Generated with
-- `prisma migrate diff` against the database at 20260924120000 (docs/SPRINT-19-NOTES.md §5).

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('card', 'apple_pay', 'google_pay');

-- AlterTable
ALTER TABLE "PaymentAttempt" ADD COLUMN     "cardBrand" TEXT,
ADD COLUMN     "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'card';
