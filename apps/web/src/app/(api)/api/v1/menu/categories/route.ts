// SPRINT-2: GET /api/v1/menu/categories — category summaries without items
import { getCategories } from "@harolds/db";
import { handleRouteError, ok } from "@/lib/api";
import { enforceRateLimit } from "@/lib/enforce-rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const limited = enforceRateLimit(request, "menu");
    if (limited) return limited;
    const categories = await getCategories();
    return ok(
      { categories },
      {
        headers: {
          "Cache-Control": "no-cache, must-revalidate",
        },
      },
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
