// SPRINT-8: PUT /api/internal/admin/modifiers/[id]/bindings — items offering a group.
import { replaceGroupBindings } from "@harolds/db";
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
    const body = parsed.value as { bindings?: Array<{ itemId: string; sortOrder: number }> };
    await replaceGroupBindings(id, body.bindings ?? [], session.userId);
    return adminOk({ ok: true });
  } catch (err) {
    return adminAuthError(err);
  }
}
