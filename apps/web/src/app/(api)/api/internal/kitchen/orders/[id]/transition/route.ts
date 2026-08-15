// SPRINT-6: POST /api/internal/kitchen/orders/[id]/transition — KDS action through the single table.
import {
  applyOrderTransition,
  getKitchenOrder,
  IllegalOrderTransitionError,
  isKdsTargetStatus,
  StaleOrderTransitionError,
} from "@harolds/db";
import { KitchenErrorCode } from "@harolds/types";
import { emitLog } from "@harolds/config";
import { requireKitchenSession } from "@/lib/kitchen-auth";
import { kitchenAuthError, kitchenFail, kitchenOk } from "@/lib/kitchen-http";
import { enforceRateLimit } from "@/lib/enforce-rate-limit";
import { BODY_LIMITS, readBoundedJson } from "@/lib/read-json";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const limited = enforceRateLimit(request, "kitchenOther");
    if (limited) return limited;
    const session = await requireKitchenSession(request);
    const { id } = await ctx.params;
    const existing = await getKitchenOrder(id);
    if (!existing) {
      return kitchenFail(KitchenErrorCode.NOT_FOUND, "Order not found.");
    }
    const parsed = await readBoundedJson(request, { maxBytes: BODY_LIMITS.jsonAdminBytes, kind: "kitchen" });
    if (!parsed.ok) return parsed.response;
    const body = parsed.value as { to?: unknown };
    const to = typeof body.to === "string" ? body.to : "";
    if (!isKdsTargetStatus(to)) {
      return kitchenFail(
        KitchenErrorCode.ILLEGAL_TRANSITION,
        "That status change is not a kitchen-display action.",
        { to },
      );
    }
    const result = await applyOrderTransition({
      orderId: id,
      to,
      source: "KDS",
      sessionId: session.sessionId,
      userId: session.userId,
    });
    return kitchenOk({ from: result.from, to: result.to, orderId: result.orderId });
  } catch (err) {
    if (err instanceof IllegalOrderTransitionError) {
      return kitchenFail(
        KitchenErrorCode.ILLEGAL_TRANSITION,
        `Cannot move this order from ${err.from} to ${err.to}.`,
        { from: err.from, to: err.to },
      );
    }
    if (err instanceof StaleOrderTransitionError) {
      return kitchenFail(
        KitchenErrorCode.STALE_TRANSITION,
        "This order already changed. Refresh the board.",
        { expected: err.expected, actual: err.actual },
      );
    }
    try {
      return kitchenAuthError(err);
    } catch {
      emitLog("error", "kitchen.transition_failed", { name: err instanceof Error ? err.name : "Error" }, { scope: "kitchen" });
      return kitchenFail(KitchenErrorCode.VALIDATION_ERROR, "Could not update the order.");
    }
  }
}
