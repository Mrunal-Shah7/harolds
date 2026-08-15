// SPRINT-8: POST /api/internal/admin/orders/[id]/status — manager correction, distinct from KDS.
import { applyAdminStatusCorrection, recordAdminAudit } from "@harolds/db";
import { AdminErrorCode, OrderStatus } from "@harolds/types";
import { requireAdmin } from "@/lib/admin-auth";
import { adminAuthError, adminFail, adminOk } from "@/lib/admin-http";
import { readAdminJson } from "@/lib/admin-body";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STATUSES = new Set<string>(Object.values(OrderStatus));

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdmin(request);
    const { id } = await ctx.params;
    const parsed = await readAdminJson(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.value as { to?: string; reason?: string; confirmed?: boolean };
    if (body.confirmed !== true) {
      return adminFail(AdminErrorCode.VALIDATION_ERROR, "Status correction requires confirmation.");
    }
    if (!body.to || !STATUSES.has(body.to)) {
      return adminFail(AdminErrorCode.VALIDATION_ERROR, "Unknown status.");
    }
    const result = await applyAdminStatusCorrection({
      orderId: id,
      to: body.to as (typeof OrderStatus)[keyof typeof OrderStatus],
      reason: body.reason ?? "",
      sessionId: session.sessionId,
      userId: session.userId,
    });
    await recordAdminAudit({
      userId: session.userId,
      action: "ORDER_STATUS_CORRECTION",
      entityType: "Order",
      entityId: id,
      summary: `Corrected ${result.from} → ${result.to}: ${(body.reason ?? "").slice(0, 80)}`,
    });
    return adminOk(result);
  } catch (err) {
    return adminAuthError(err);
  }
}
