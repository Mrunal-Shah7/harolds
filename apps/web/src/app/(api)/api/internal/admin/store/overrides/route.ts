// SPRINT-12: GET/POST /api/internal/admin/store/overrides — temporary trading overrides.
import { listTradingOverrides, createTradingOverride } from "@harolds/db";
import { requireAdmin } from "@/lib/admin-auth";
import { adminAuthError, adminOk } from "@/lib/admin-http";
import { readAdminJson } from "@/lib/admin-body";
import { assertAdminRouteDeclared } from "@/lib/admin-route-registry";

export const dynamic = "force-dynamic";
export const revalidate = 0;

assertAdminRouteDeclared("GET /api/internal/admin/store/overrides", "MANAGER");
assertAdminRouteDeclared("POST /api/internal/admin/store/overrides", "MANAGER");

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    return adminOk(await listTradingOverrides({ includeExpired: false }));
  } catch (err) {
    return adminAuthError(err);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdmin(request);
    const parsed = await readAdminJson(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.value as Record<string, unknown>;
    const row = await createTradingOverride(
      {
        kind: String(body.kind ?? ""),
        businessDate: typeof body.businessDate === "string" ? body.businessDate : undefined,
        openTime: typeof body.openTime === "string" ? body.openTime : null,
        closeTime: typeof body.closeTime === "string" ? body.closeTime : null,
        customerMessage: typeof body.customerMessage === "string" ? body.customerMessage : null,
        expiresAt: typeof body.expiresAt === "string" ? body.expiresAt : null,
      },
      session.userId,
    );
    return adminOk(row);
  } catch (err) {
    return adminAuthError(err);
  }
}
