// SPRINT-8: POST /api/internal/admin/orders/[id]/refund — calls Sprint 4 refundOrder.
import { assertRefundAmount, getOrderWithLines, parseCurrencyInput, recordAdminAudit } from "@harolds/db";
import { AdminErrorCode } from "@harolds/types";
import { refundOrder } from "@/lib/refunds";
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
    const body = parsed.value as {
      amountCents?: number | "full";
      price?: string;
      clientIdempotencyKey?: string;
      confirmed?: boolean;
    };
    if (body.confirmed !== true) {
      return adminFail(AdminErrorCode.VALIDATION_ERROR, "Refunds require explicit confirmation.");
    }
    const order = await getOrderWithLines(id);
    if (!order) return adminFail(AdminErrorCode.NOT_FOUND, "Order not found.");
    const remaining = order.totalCents - order.refundedCents;
    let amount: number;
    if (typeof body.price === "string" && body.price.trim()) {
      amount = parseCurrencyInput(body.price);
    } else if (body.amountCents === "full" || body.amountCents === undefined) {
      amount = remaining;
    } else {
      amount = body.amountCents;
    }
    assertRefundAmount(amount, remaining);
    const key =
      typeof body.clientIdempotencyKey === "string" && body.clientIdempotencyKey.length > 8
        ? body.clientIdempotencyKey
        : `admin-refund-${id}-${session.userId}-${amount}-${Date.now()}`;
    const result = await refundOrder({
      orderId: id,
      amountCents: amount,
      clientIdempotencyKey: key,
      actedByUserId: session.userId,
    });
    if (!result.ok) {
      const code =
        result.code === "NOT_FOUND"
          ? AdminErrorCode.NOT_FOUND
          : result.code === "VALIDATION"
            ? AdminErrorCode.VALIDATION_ERROR
            : AdminErrorCode.VALIDATION_ERROR;
      return adminFail(code, result.message);
    }
    await recordAdminAudit({
      userId: session.userId,
      action: "ORDER_REFUND",
      entityType: "Order",
      entityId: id,
      summary: `Refund ${amount} cents (${result.order.paymentStatus}, processor ${result.processorRefundId ? "recorded" : "pending"})`,
    });
    return adminOk({
      refundedCents: result.order.refundedCents,
      remainingRefundableCents: result.order.totalCents - result.order.refundedCents,
      paymentStatus: result.order.paymentStatus,
      status: result.order.status,
      processorRefundId: result.processorRefundId ? "recorded" : null,
      pendingConfirmation: result.processorRefundId === null,
    });
  } catch (err) {
    return adminAuthError(err);
  }
}
