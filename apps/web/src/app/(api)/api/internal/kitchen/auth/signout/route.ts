// SPRINT-6: POST /api/internal/kitchen/auth/signout — revoke session (row kept, revokedAt set).
import { revokeKitchenSession } from "@harolds/db";
import { emitLog } from "@harolds/config";
import { bearerToken, kitchenAuthError, kitchenFail, kitchenOk } from "@/lib/kitchen-http";
import { KitchenErrorCode } from "@harolds/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    const token = bearerToken(request);
    if (!token) {
      return kitchenFail(KitchenErrorCode.SESSION_REQUIRED, "Sign-in required.");
    }
    await revokeKitchenSession(token);
    return kitchenOk({ ok: true });
  } catch (err) {
    try {
      return kitchenAuthError(err);
    } catch {
      emitLog("error", "kitchen.signout_failed", { name: err instanceof Error ? err.name : "Error" }, { scope: "kitchen" });
      return kitchenFail(KitchenErrorCode.VALIDATION_ERROR, "Sign-out failed.");
    }
  }
}
