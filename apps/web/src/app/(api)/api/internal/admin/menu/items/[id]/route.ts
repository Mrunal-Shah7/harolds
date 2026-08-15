// SPRINT-8: GET/PATCH /api/internal/admin/menu/items/[id] — price input is currency text.
import { getAdminItem, parseCurrencyInput, updateItem } from "@harolds/db";
import { AdminErrorCode } from "@harolds/types";
import { requireAdmin } from "@/lib/admin-auth";
import { adminAuthError, adminFail, adminOk } from "@/lib/admin-http";
import { readAdminJson } from "@/lib/admin-body";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(request);
    const { id } = await ctx.params;
    const row = await getAdminItem(id);
    if (!row) return adminFail(AdminErrorCode.NOT_FOUND, "Item not found.");
    return adminOk(row);
  } catch (err) {
    return adminAuthError(err);
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdmin(request);
    const { id } = await ctx.params;
    const parsed = await readAdminJson(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.value as Record<string, unknown>;
    const patch: Parameters<typeof updateItem>[1] = {};
    if (typeof body.name === "string") patch.name = body.name;
    if (body.boardLabel === null || typeof body.boardLabel === "string") patch.boardLabel = body.boardLabel as string | null;
    if (body.description === null || typeof body.description === "string") patch.description = body.description as string | null;
    if (typeof body.price === "string") patch.basePriceCents = parseCurrencyInput(body.price);
    if (typeof body.basePriceCents === "number") patch.basePriceCents = body.basePriceCents;
    if (typeof body.categoryId === "string") patch.categoryId = body.categoryId;
    if (typeof body.slug === "string") patch.slug = body.slug;
    if (typeof body.sortOrder === "number") patch.sortOrder = body.sortOrder;
    if (typeof body.isActive === "boolean") patch.isActive = body.isActive;
    if (typeof body.isSoldOut === "boolean") patch.isSoldOut = body.isSoldOut;
    if (typeof body.isFeatured === "boolean") patch.isFeatured = body.isFeatured;
    if (body.featuredSortOrder === null || typeof body.featuredSortOrder === "number") {
      patch.featuredSortOrder = body.featuredSortOrder as number | null;
    }
    if (typeof body.isMostOrdered === "boolean") patch.isMostOrdered = body.isMostOrdered;
    if (body.mostOrderedSortOrder === null || typeof body.mostOrderedSortOrder === "number") {
      patch.mostOrderedSortOrder = body.mostOrderedSortOrder as number | null;
    }
    if (body.imageUrl === null || typeof body.imageUrl === "string") patch.imageUrl = body.imageUrl as string | null;
    return adminOk(await updateItem(id, patch, session.userId));
  } catch (err) {
    return adminAuthError(err);
  }
}
