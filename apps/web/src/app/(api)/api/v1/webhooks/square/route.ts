// SPRINT-4: POST /api/v1/webhooks/square — Square-only; not a storefront surface
import { processSquareWebhook } from "@/lib/webhooks-square";
import { ApiErrorCode } from "@harolds/types";
import { fail, handleRouteError, ok } from "@/lib/api";
import { BODY_LIMITS } from "@harolds/config";
import { bindRequestId } from "@/lib/request-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    bindRequestId(request);
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > BODY_LIMITS.webhookBytes) {
      return fail(ApiErrorCode.VALIDATION_ERROR, "Request body is too large.");
    }
    const rawBody = await request.text();
    if (rawBody.length > BODY_LIMITS.webhookBytes) {
      return fail(ApiErrorCode.VALIDATION_ERROR, "Request body is too large.");
    }
    const signature =
      request.headers.get("x-square-hmacsha256-signature") ??
      request.headers.get("X-Square-HmacSha256-Signature");

    const result = await processSquareWebhook(rawBody, signature);
    if (!result.ok) {
      return fail(
        result.status === 401 ? ApiErrorCode.UNAUTHORIZED : ApiErrorCode.VALIDATION_ERROR,
        result.message,
      );
    }

    return ok({ received: true, outcome: result.outcome }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return handleRouteError(err);
  }
}
