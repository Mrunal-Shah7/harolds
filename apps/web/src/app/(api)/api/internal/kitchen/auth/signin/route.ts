// SPRINT-6: POST /api/internal/kitchen/auth/signin — PIN check, hashed session issued once.
import { getKitchenConfig, emitLog } from "@harolds/config";
import { signInWithPin } from "@harolds/db";
import { KitchenErrorCode } from "@harolds/types";
import { kitchenAuthError, kitchenFail, kitchenOk } from "@/lib/kitchen-http";
import { enforceRateLimit } from "@/lib/enforce-rate-limit";
import { BODY_LIMITS, readBoundedJson } from "@/lib/read-json";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    const limited = enforceRateLimit(request, "kitchenSignin");
    if (limited) return limited;
    const parsed = await readBoundedJson(request, { maxBytes: BODY_LIMITS.jsonAdminBytes, kind: "kitchen" });
    if (!parsed.ok) return parsed.response;
    const body = parsed.value as { userId?: unknown; pin?: unknown };
    const userId = typeof body.userId === "string" ? body.userId : "";
    const pin = typeof body.pin === "string" ? body.pin : "";
    if (!userId || !pin) {
      return kitchenFail(KitchenErrorCode.VALIDATION_ERROR, "Choose a staff name and enter a PIN.");
    }
    const cfg = getKitchenConfig();
    const issued = await signInWithPin(
      userId,
      pin,
      {
        maxFailures: cfg.maxPinFailures,
        lockoutMs: cfg.pinLockoutMs,
        sessionTtlMs: cfg.sessionTtlMs,
      },
      {
        ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: request.headers.get("user-agent"),
      },
    );
    return kitchenOk({
      token: issued.token,
      expiresAt: issued.expiresAt.toISOString(),
      user: issued.user,
    });
  } catch (err) {
    try {
      return kitchenAuthError(err);
    } catch {
      emitLog("error", "kitchen.signin_failed", { name: err instanceof Error ? err.name : "Error" }, { scope: "kitchen" });
      return kitchenFail(KitchenErrorCode.VALIDATION_ERROR, "Sign-in failed.");
    }
  }
}
