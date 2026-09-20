// SPRINT-18: GET/PUT /api/internal/admin/seo — the admin SEO section's read and save. OWNER only:
// this surface changes what search engines publish about the business.
//
// The admin reads the AUTHORITATIVE, uncached rows (loadSeoSnapshot) — an editor working from a
// cached copy would save against a stale version. The storefront never does this; it reads
// through the tagged accessor in lib/seo/data.ts. The save revalidates that tag in-process after
// commit (lib/seo/save.ts). Internal admin route: not part of docs/openapi/v1.yaml.
import { AdminErrorCode, AdminRole } from "@harolds/types";
import {
  getStoreConfig,
  listStoreHours,
  loadSeoSnapshot,
  normalizePhoneToE164,
  SeoVersionConflictError,
} from "@harolds/db";
import { requireAdmin } from "@/lib/admin-auth";
import { adminAuthError, adminFail, adminOk } from "@/lib/admin-http";
import { readAdminJson } from "@/lib/admin-body";
import { detectDrift } from "@/lib/seo/drift";
import { SEO_ROUTES } from "@/lib/seo/routes";
import { saveSeoSettings } from "@/lib/seo/save";
import type { SeoSnapshot } from "@harolds/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function adminView(snapshot: SeoSnapshot) {
  const [config, hours] = await Promise.all([getStoreConfig(), listStoreHours()]);
  const drift = detectDrift(snapshot.business, {
    addressLine1: config.addressLine1,
    addressLine2: config.addressLine2,
    city: config.city,
    state: config.state,
    postalCode: config.postalCode,
    contactPhone: config.contactPhone,
    contactPhoneE164: normalizePhoneToE164(config.contactPhone),
    hours: hours.map((h) => ({ dayOfWeek: h.dayOfWeek, openTime: h.openTime, closeTime: h.closeTime, isClosed: h.isClosed })),
  });
  return { snapshot, drift, routes: SEO_ROUTES };
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request, AdminRole.OWNER);
    return adminOk(await adminView(await loadSeoSnapshot()));
  } catch (err) {
    return adminAuthError(err);
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireAdmin(request, AdminRole.OWNER);
    const parsed = await readAdminJson(request);
    if (!parsed.ok) return parsed.response;

    const outcome = await saveSeoSettings(parsed.value, { userId: session.userId });
    if (!outcome.ok) {
      const [field, message] = Object.entries(outcome.errors)[0] ?? ["request", "Invalid SEO settings."];
      return adminFail(AdminErrorCode.VALIDATION_ERROR, message, {
        field,
        fieldErrors: outcome.errors,
        warnings: outcome.warnings,
      });
    }
    return adminOk({
      ...(await adminView(outcome.snapshot)),
      warnings: outcome.warnings,
      changedFields: outcome.changes.map((c) =>
        c.entityType === "SeoRouteOverride" ? `routes.${c.entityId}.${c.field}` : `${c.entityType === "SeoBusiness" ? "business" : "site"}.${c.field}`,
      ),
      // In-process revalidation has already happened by the time this is sent (fork mode).
      live: outcome.live,
    });
  } catch (err) {
    if (err instanceof SeoVersionConflictError) {
      return adminFail(AdminErrorCode.CONFLICT, err.message, { currentVersion: err.actual });
    }
    return adminAuthError(err);
  }
}
