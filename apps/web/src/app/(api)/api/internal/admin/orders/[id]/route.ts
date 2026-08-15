// SPRINT-8: GET /api/internal/admin/orders/[id] — full reconstruction screen.
import { getAdminOrderDetail, getStoreConfig } from "@harolds/db";
import { AdminErrorCode } from "@harolds/types";
import { requireAdmin } from "@/lib/admin-auth";
import { adminAuthError, adminFail, adminOk } from "@/lib/admin-http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(request);
    const { id } = await ctx.params;
    const store = await getStoreConfig();
    const detail = await getAdminOrderDetail(id, store.timezone);
    if (!detail) return adminFail(AdminErrorCode.NOT_FOUND, "Order not found.");
    return adminOk(detail);
  } catch (err) {
    return adminAuthError(err);
  }
}
