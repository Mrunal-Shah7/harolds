// SPRINT-6: GET /api/internal/kitchen/auth/roster — active staff names for the PIN screen.
import { listKitchenRoster } from "@harolds/db";
import { emitLog } from "@harolds/config";
import { kitchenFail, kitchenOk } from "@/lib/kitchen-http";
import { KitchenErrorCode } from "@harolds/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const staff = await listKitchenRoster();
    return kitchenOk({ staff });
  } catch (err) {
    emitLog("error", "kitchen.roster_failed", { name: err instanceof Error ? err.name : "Error" }, { scope: "kitchen" });
    return kitchenFail(KitchenErrorCode.VALIDATION_ERROR, "Could not load staff list.");
  }
}
