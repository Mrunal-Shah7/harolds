// SPRINT-8: PATCH/DELETE /api/internal/admin/store/closures/[id]
import { deleteStoreClosure, updateStoreClosure } from "@harolds/db";
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
    const body = parsed.value as { reason?: string | null };
    return adminOk(await updateStoreClosure(id, body.reason ?? null, session.userId));
  } catch (err) {
    return adminAuthError(err);
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdmin(request);
    const { id } = await ctx.params;
    await deleteStoreClosure(id, session.userId);
    return adminOk({ ok: true });
  } catch (err) {
    return adminAuthError(err);
  }
}
