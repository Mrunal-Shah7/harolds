// SPRINT-8: GET/PUT /api/internal/admin/menu/curation — featured and most-ordered lists.
import { prisma, setCuration } from "@harolds/db";
import { requireAdmin } from "@/lib/admin-auth";
import { adminAuthError, adminOk } from "@/lib/admin-http";
import { readAdminJson } from "@/lib/admin-body";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const [featured, mostOrdered] = await Promise.all([
      prisma.menuItem.findMany({
        where: { isFeatured: true },
        orderBy: { featuredSortOrder: "asc" },
        select: { id: true, name: true, featuredSortOrder: true, isActive: true },
      }),
      prisma.menuItem.findMany({
        where: { isMostOrdered: true },
        orderBy: { mostOrderedSortOrder: "asc" },
        select: { id: true, name: true, mostOrderedSortOrder: true, isActive: true },
      }),
    ]);
    return adminOk({ featured, mostOrdered });
  } catch (err) {
    return adminAuthError(err);
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireAdmin(request);
    const parsed = await readAdminJson(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.value as { kind?: string; itemIds?: string[] };
    const kind = body.kind === "mostOrdered" ? "mostOrdered" : "featured";
    await setCuration(kind, Array.isArray(body.itemIds) ? body.itemIds : [], session.userId);
    return adminOk({ ok: true });
  } catch (err) {
    return adminAuthError(err);
  }
}
