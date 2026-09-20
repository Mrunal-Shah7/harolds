-- SPRINT-18: SEO data model — business record, opening hours, site defaults, route overrides.
--
-- Additive only. No existing table, column, index or constraint is touched. Reversal is
-- packages/db/prisma/rollbacks/20260919120000_sprint18_seo.down.sql.
--
-- SeoBusiness starts empty with isConfigured = false (Critical rule 8: no Restaurant node until
-- the operator fills it in). Site defaults and route overrides are seeded here rather than in
-- `pnpm db:seed` because the seed refuses to run against a database that has orders — i.e.
-- production — and the storefront needs those rows to exist there too.

-- CreateTable
CREATE TABLE "SeoBusiness" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "displayName" TEXT NOT NULL,
    "legalName" TEXT,
    "description" TEXT NOT NULL,
    "streetAddress" TEXT NOT NULL,
    "addressLocality" TEXT NOT NULL,
    "addressRegion" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "addressCountry" TEXT NOT NULL,
    "telephone" TEXT,
    "telephoneDisplay" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "priceRange" TEXT,
    "servesCuisine" TEXT[],
    "logoUrl" TEXT,
    "imageUrl" TEXT,
    "sameAs" TEXT[],
    "acceptsReservations" BOOLEAN NOT NULL DEFAULT false,
    "isConfigured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeoBusiness_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SeoBusiness_singleton_check" CHECK ("id" = 'default'),
    -- A pickup counter takes no reservations; the column exists so the claim is explicit.
    CONSTRAINT "SeoBusiness_no_reservations_check" CHECK ("acceptsReservations" = false),
    CONSTRAINT "SeoBusiness_latitude_check" CHECK ("latitude" IS NULL OR ("latitude" >= -90 AND "latitude" <= 90)),
    CONSTRAINT "SeoBusiness_longitude_check" CHECK ("longitude" IS NULL OR ("longitude" >= -180 AND "longitude" <= 180))
);

-- CreateTable
CREATE TABLE "SeoOpeningHours" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL DEFAULT 'default',
    "dayOfWeek" INTEGER NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "opens" TEXT,
    "closes" TEXT,
    "overnight" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeoOpeningHours_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SeoOpeningHours_dayOfWeek_check" CHECK ("dayOfWeek" >= 0 AND "dayOfWeek" <= 6)
);

-- CreateTable
CREATE TABLE "SeoSiteDefaults" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "siteName" TEXT NOT NULL,
    "canonicalHost" TEXT NOT NULL,
    "defaultTitle" TEXT NOT NULL,
    "titleTemplate" TEXT NOT NULL,
    "defaultDescription" TEXT NOT NULL,
    "defaultOgImageUrl" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en_US',
    "twitterHandle" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeoSiteDefaults_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SeoSiteDefaults_singleton_check" CHECK ("id" = 'default')
);

-- CreateTable
CREATE TABLE "SeoRouteOverride" (
    "routeKey" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "ogImageUrl" TEXT,
    "breadcrumbLabel" TEXT,
    "noindex" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeoRouteOverride_pkey" PRIMARY KEY ("routeKey")
);

-- CreateIndex
CREATE INDEX "SeoOpeningHours_businessId_dayOfWeek_idx" ON "SeoOpeningHours"("businessId", "dayOfWeek");

-- AddForeignKey
ALTER TABLE "SeoOpeningHours" ADD CONSTRAINT "SeoOpeningHours_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "SeoBusiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Singleton business row: required NOT NULL columns start empty; isConfigured stays false until
-- the operator fills Business details. No opening hours — an unset day claims nothing.
INSERT INTO "SeoBusiness" (
    "id", "displayName", "description", "streetAddress", "addressLocality",
    "addressRegion", "postalCode", "addressCountry", "servesCuisine", "sameAs",
    "isConfigured", "updatedAt"
) VALUES (
    'default',
    '',
    '',
    '',
    '',
    '',
    '',
    'US',
    ARRAY[]::TEXT[],
    ARRAY[]::TEXT[],
    false,
    CURRENT_TIMESTAMP
) ON CONFLICT ("id") DO NOTHING;

-- Site defaults are not claims about the business, so they start from the copy the storefront
-- already served before this sprint. canonicalHost is the operator-confirmed production origin.
INSERT INTO "SeoSiteDefaults" (
    "id", "siteName", "canonicalHost", "defaultTitle", "titleTemplate", "defaultDescription",
    "locale", "version", "updatedAt"
) VALUES (
    'default',
    'Harold''s Chicken Burnham',
    'https://haroldsburnham.com',
    'Harold''s Chicken Burnham',
    '{pageTitle} | Harold''s Chicken Burnham',
    'Order pickup online from Harold''s Chicken Burnham.',
    'en_US',
    1,
    CURRENT_TIMESTAMP
) ON CONFLICT ("id") DO NOTHING;

-- Route overrides, so each route has its own title instead of every page repeating the site
-- default. Home has none on purpose: it resolves to the site default title and description.
-- checkout and order-status are stored noindex = true for honesty, but the code forces it
-- regardless (apps/web/src/lib/seo/routes.ts) — that control does not depend on this row.
INSERT INTO "SeoRouteOverride" ("routeKey", "title", "description", "noindex", "updatedAt") VALUES
    ('menu', 'Menu', 'The full Harold''s Chicken Burnham menu. Order online for pickup.', false, CURRENT_TIMESTAMP),
    ('checkout', 'Checkout', NULL, true, CURRENT_TIMESTAMP),
    ('order-status', 'Your order', NULL, true, CURRENT_TIMESTAMP)
ON CONFLICT ("routeKey") DO NOTHING;
