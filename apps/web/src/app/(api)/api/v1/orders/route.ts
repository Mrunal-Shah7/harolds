// SPRINT-4: POST /api/v1/orders — create order + take payment (authoritative reprice)
import { checkoutOrder } from "@/lib/checkout";
import { fail, handleRouteError, ok } from "@/lib/api";
import { env, emitLog } from "@harolds/config";
import { getSquareEnvironment } from "@harolds/square";
import { BODY_LIMITS, readBoundedJson } from "@/lib/read-json";
import { enforceRateLimit } from "@/lib/enforce-rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

emitLog(
  "info",
  "square.environment",
  { squareEnvironment: getSquareEnvironment(), appIdPrefix: env.SQUARE_APPLICATION_ID.slice(0, 8) },
  { scope: "square" },
);

export async function POST(request: Request) {
  try {
    const limited = enforceRateLimit(request, "orders");
    if (limited) return limited;

    const parsedBody = await readBoundedJson(request, { maxBytes: BODY_LIMITS.jsonPublicBytes });
    if (!parsedBody.ok) return parsedBody.response;

    const result = await checkoutOrder(parsedBody.value);
    if (!result.ok) {
      return fail(result.code, result.message, result.details ?? null);
    }

    return ok(result.order, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
