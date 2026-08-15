// SPRINT-8: POST /api/internal/admin/orders/[id]/cancel — Sprint 4 cancelOrder.
import { recordAdminAudit } from "@harolds/db";
import { AdminErrorCode } from "@harolds/types";
import { cancelOrder } from "@/lib/refunds";
import { requireAdmin } from "@/lib/admin-auth";
import { adminAuthError, adminFail, adminOk } from "@/lib/admin-http";
import { readAdminJson } from "@/lib/admin-body";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdmin(request);
    const { id } = await ctx.params;
    const parsed = await readAdminJson(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.value as { confirmed?: boolean; clientIdempotencyKey?: string };
    if (body.confirmed !== true) {
      return adminFail(AdminErrorCode.VALIDATION_ERROR, "Cancellation requires explicit confirmation.");
    }
    const key =
      typeof body.clientIdempotencyKey === "string" && body.clientIdempotencyKey.length > 8
        ? body.clientIdempotencyKey
        : `admin-cancel-${id}-${session.userId}-${Date.now()}`;
    const result = await cancelOrder(id, key, session.userId);
    if (!result.ok) {
      return adminFail(AdminErrorCode.VALIDATION_ERROR, result.message);
    }
    await recordAdminAudit({
      userId: session.userId,
      action: "ORDER_CANCEL",
      entityType: "Order",
      entityId: id,
      summary: `Cancelled order (${result.order.status})`,
    });
    return adminOk({
      status: result.order.status,
      paymentStatus: result.order.paymentStatus,
      refundedCents: result.order.refundedCents,
    });
  } catch (err) {
    return adminAuthError(err);
  }
}
