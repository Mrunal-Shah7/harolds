// SPRINT-2: GET /api/v1/menu/items/[id] — single item by id with modifiers
import { getItemById } from "@harolds/db";
import { ApiErrorCode } from "@harolds/types";
import { fail, handleRouteError, ok } from "@/lib/api";
import { enforceRateLimit } from "@/lib/enforce-rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const limited = enforceRateLimit(request, "menu");
    if (limited) return limited;
    const { id } = await params;
    const item = await getItemById(id);
    if (!item) {
      return fail(ApiErrorCode.NOT_FOUND, "Item not found.");
    }
    return ok(item, {
      headers: { "Cache-Control": "no-cache, must-revalidate" },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
