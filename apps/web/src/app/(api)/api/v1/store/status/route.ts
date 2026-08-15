// SPRINT-2: GET /api/v1/store/status — identity, hours, open/closed, prep, money settings
import { getStoreStatus } from "@harolds/db";
import { handleRouteError, ok } from "@/lib/api";
import { enforceRateLimit } from "@/lib/enforce-rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const limited = enforceRateLimit(request, "storeStatus");
    if (limited) return limited;
    const status = await getStoreStatus();
    return ok(status, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
