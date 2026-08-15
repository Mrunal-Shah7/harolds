// SPRINT-6: GET /api/internal/kitchen/orders/[id] — one queue card, same shape as the list.
import { getKitchenOrder } from "@harolds/db";
import { emitLog } from "@harolds/config";
import { KitchenErrorCode } from "@harolds/types";
import { requireKitchenSession } from "@/lib/kitchen-auth";
import { kitchenAuthError, kitchenFail, kitchenOk } from "@/lib/kitchen-http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  try {
    await requireKitchenSession(request);
    const { id } = await ctx.params;
    const order = await getKitchenOrder(id);
    if (!order) {
      return kitchenFail(KitchenErrorCode.NOT_FOUND, "Order not found.");
    }
    return kitchenOk({ order });
  } catch (err) {
    try {
      return kitchenAuthError(err);
    } catch {
      emitLog("error", "kitchen.order_detail_failed", { name: err instanceof Error ? err.name : "Error" }, { scope: "kitchen" });
      return kitchenFail(KitchenErrorCode.VALIDATION_ERROR, "Could not load the order.");
    }
  }
}
