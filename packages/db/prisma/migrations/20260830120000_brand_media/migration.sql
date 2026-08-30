-- Storefront brand media.
-- Both columns hold a content-addressed media URL (/api/v1/media/<sha256>) produced by the
-- existing upload pipeline, so no new storage mechanism is introduced. Both are nullable and
-- fall back to the design's existing placeholders: the category initial, and the plain
-- paper hero.
ALTER TABLE "Category" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "StoreConfig" ADD COLUMN "heroImageUrl" TEXT;
