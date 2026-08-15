// SPRINT-4: GET /api/v1/orders/status/[lookupToken] — public status by unguessable token only
import { findOrderByLookupToken, getPublicOrderView } from "@harolds/db";
import { ApiErrorCode } from "@harolds/types";
import { fail, handleRouteError, ok } from "@/lib/api";
import { enforceRateLimit } from "@/lib/enforce-rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ lookupToken: string }> };

export async function GET(request: Request, ctx: Ctx) {
  try {
    const limited = enforceRateLimit(request, "orderStatus");
    if (limited) return limited;
    const { lookupToken } = await ctx.params;
    if (!lookupToken || lookupToken.length < 16) {
      return fail(ApiErrorCode.NOT_FOUND, "Order not found.");
    }

    const order = await findOrderByLookupToken(lookupToken);
    if (!order) {
      return fail(ApiErrorCode.NOT_FOUND, "Order not found.");
    }

    const view = getPublicOrderView(order);
    return ok(
      {
        ...view,
        estimatedReadyAt: view.estimatedReadyAt?.toISOString() ?? null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
