// SPRINT-8: PUT /api/internal/admin/menu/items/[id]/bindings — groups on an item.
import { replaceItemBindings } from "@harolds/db";
import { requireAdmin } from "@/lib/admin-auth";
import { adminAuthError, adminOk } from "@/lib/admin-http";
import { readAdminJson } from "@/lib/admin-body";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdmin(request);
    const { id } = await ctx.params;
    const parsed = await readAdminJson(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.value as { bindings?: Array<{ groupId: string; sortOrder: number }> };
    await replaceItemBindings(id, body.bindings ?? [], session.userId);
    return adminOk({ ok: true });
  } catch (err) {
    return adminAuthError(err);
  }
}
