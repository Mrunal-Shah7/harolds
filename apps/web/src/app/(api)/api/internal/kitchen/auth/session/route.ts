// SPRINT-6: GET /api/internal/kitchen/auth/session — validate stored token after a reload.
import { requireKitchenSession } from "@/lib/kitchen-auth";
import { kitchenAuthError, kitchenFail, kitchenOk } from "@/lib/kitchen-http";
import { KitchenErrorCode } from "@harolds/types";
import { enforceRateLimit } from "@/lib/enforce-rate-limit";
import { emitLog } from "@harolds/config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const limited = enforceRateLimit(request, "kitchenOther");
    if (limited) return limited;
    const session = await requireKitchenSession(request);
    return kitchenOk({
      user: {
        id: session.userId,
        displayName: session.displayName,
        role: session.role,
        sessionExpiresAt: session.expiresAt.toISOString(),
      },
    });
  } catch (err) {
    try {
      return kitchenAuthError(err);
    } catch {
      emitLog("error", "kitchen.session_failed", { name: err instanceof Error ? err.name : "Error" }, { scope: "kitchen" });
      return kitchenFail(KitchenErrorCode.SESSION_REQUIRED, "Sign-in required.");
    }
  }
}
