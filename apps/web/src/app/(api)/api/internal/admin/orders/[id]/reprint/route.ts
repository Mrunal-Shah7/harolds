// SPRINT-8: POST /api/internal/admin/orders/[id]/reprint — Sprint 5 reprintTicket.
import { recordAdminAudit, reprintTicket } from "@harolds/db";
import { AdminErrorCode, PrintTarget } from "@harolds/types";
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
    const body = parsed.value as { target?: string; confirmed?: boolean };
    if (body.confirmed !== true) {
      return adminFail(
        AdminErrorCode.VALIDATION_ERROR,
        "Reprint requires confirmation. A reprinted kitchen ticket may be cooked twice if staff miss the reprint marker.",
      );
    }
    const target = body.target === PrintTarget.COUNTER_RECEIPT ? PrintTarget.COUNTER_RECEIPT : PrintTarget.KITCHEN_TICKET;
    const job = await reprintTicket(id, target);
    await recordAdminAudit({
      userId: session.userId,
      action: "ORDER_REPRINT",
      entityType: "PrintJob",
      entityId: job.id,
      summary: `Reprinted ${target} for order ${id}`,
    });
    return adminOk({ id: job.id, target: job.target, status: job.status, isReprint: job.isReprint });
  } catch (err) {
    return adminAuthError(err);
  }
}
