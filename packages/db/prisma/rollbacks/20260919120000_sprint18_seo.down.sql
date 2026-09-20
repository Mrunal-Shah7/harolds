-- SPRINT-18: reversal of migrations/20260919120000_sprint18_seo.
--
-- Prisma has no down migrations; this is the hand-written inverse, proven on a scratch database
-- (docs/SPRINT-18-NOTES.md §1). It drops ONLY the four SEO tables and the migration's history
-- row. No other table references them, so nothing else is affected. Audit rows the SEO section
-- wrote to "AdminAuditLog" are deliberately kept — they are history, not SEO state.
--
-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f <this file>
-- Take `pnpm backup` first. Every SEO value the operator entered is lost.

BEGIN;

DROP TABLE IF EXISTS "SeoOpeningHours";
DROP TABLE IF EXISTS "SeoRouteOverride";
DROP TABLE IF EXISTS "SeoSiteDefaults";
DROP TABLE IF EXISTS "SeoBusiness";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260919120000_sprint18_seo';

COMMIT;
