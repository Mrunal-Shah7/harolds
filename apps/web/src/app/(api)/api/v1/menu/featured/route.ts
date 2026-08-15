// SPRINT-2: GET /api/v1/menu/featured — curated featured items (empty ok)
import { getFeaturedItems } from "@harolds/db";
import { handleRouteError, ok } from "@/lib/api";
import { enforceRateLimit } from "@/lib/enforce-rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const limited = enforceRateLimit(request, "menu");
    if (limited) return limited;
    const items = await getFeaturedItems();
    return ok(
      { items },
      { headers: { "Cache-Control": "no-cache, must-revalidate" } },
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
