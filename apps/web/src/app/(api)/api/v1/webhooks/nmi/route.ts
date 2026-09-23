// SPRINT-4 / SPRINT-17 / SPRINT-18.2: POST /api/v1/webhooks/nmi — gateway-only; not a storefront surface
import { processNmiWebhook } from "@/lib/webhooks-nmi";
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
    // Bytes, not `request.text()`: decoding strips a BOM and substitutes invalid sequences, and
    // either changes what the HMAC covers.
    const rawBody = Buffer.from(await request.arrayBuffer());
    if (rawBody.byteLength > BODY_LIMITS.webhookBytes) {
      return fail(ApiErrorCode.VALIDATION_ERROR, "Request body is too large.");
    }
    // NMI signs `<nonce>.<raw body>` and sends `webhook-signature: t=<nonce>,s=<digest>`.
    const signature = request.headers.get("webhook-signature");

    const result = await processNmiWebhook(rawBody, signature);
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
