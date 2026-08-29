// SPRINT-12: POST /api/internal/admin/store/overrides/[id]/cancel — one-click cancel.
import { cancelTradingOverride } from "@harolds/db";
import { requireAdmin } from "@/lib/admin-auth";
import { adminAuthError, adminOk } from "@/lib/admin-http";
import { assertAdminRouteDeclared } from "@/lib/admin-route-registry";

export const dynamic = "force-dynamic";
export const revalidate = 0;

assertAdminRouteDeclared("POST /api/internal/admin/store/overrides/[id]/cancel", "MANAGER");

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdmin(request);
    const { id } = await ctx.params;
    return adminOk(await cancelTradingOverride(id, session.userId));
  } catch (err) {
    return adminAuthError(err);
  }
}
