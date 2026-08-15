// SPRINT-8: GET/PATCH /api/internal/admin/store — singleton config; tax/tip owner-only in the service.
import { getStoreConfig, listStoreClosures, listStoreHours, updateStoreConfig } from "@harolds/db";
import { requireAdmin } from "@/lib/admin-auth";
import { adminAuthError, adminOk } from "@/lib/admin-http";
import { readAdminJson } from "@/lib/admin-body";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const [config, hours, closures] = await Promise.all([
      getStoreConfig(),
      listStoreHours(),
      listStoreClosures(),
    ]);
    return adminOk({ config, hours, closures });
  } catch (err) {
    return adminAuthError(err);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireAdmin(request);
    const parsed = await readAdminJson(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.value as Record<string, unknown>;
    const row = await updateStoreConfig(body, { userId: session.userId, role: session.role });
    return adminOk(row);
  } catch (err) {
    return adminAuthError(err);
  }
}
