// SPRINT-8: PATCH /api/internal/admin/modifiers/options/[id]
import { parseCurrencyInput, updateModifierOption } from "@harolds/db";
import { requireAdmin } from "@/lib/admin-auth";
import { adminAuthError, adminOk } from "@/lib/admin-http";
import { readAdminJson } from "@/lib/admin-body";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdmin(request);
    const { id } = await ctx.params;
    const parsed = await readAdminJson(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.value as Record<string, unknown>;
    const patch: Parameters<typeof updateModifierOption>[1] = {};
    if (typeof body.name === "string") patch.name = body.name;
    if (typeof body.price === "string") patch.priceDeltaCents = parseCurrencyInput(body.price.trim() ? body.price : "0");
    if (typeof body.priceDeltaCents === "number") patch.priceDeltaCents = body.priceDeltaCents;
    if (typeof body.sortOrder === "number") patch.sortOrder = body.sortOrder;
    if (typeof body.isActive === "boolean") patch.isActive = body.isActive;
    if (typeof body.isSoldOut === "boolean") patch.isSoldOut = body.isSoldOut;
    if (typeof body.isDefaultSelected === "boolean") patch.isDefaultSelected = body.isDefaultSelected;
    return adminOk(await updateModifierOption(id, patch, session.userId));
  } catch (err) {
    return adminAuthError(err);
  }
}
