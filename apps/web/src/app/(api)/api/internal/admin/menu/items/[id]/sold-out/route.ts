// SPRINT-8: POST /api/internal/admin/menu/items/[id]/sold-out — one-tap sold-out toggle.
import { setItemSoldOut } from "@harolds/db";
import { requireAdmin } from "@/lib/admin-auth";
import { adminAuthError, adminOk } from "@/lib/admin-http";
import { readAdminJson } from "@/lib/admin-body";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdmin(request);
    const { id } = await ctx.params;
    const parsed = await readAdminJson(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.value as { isSoldOut?: boolean };
    return adminOk(await setItemSoldOut(id, Boolean(body.isSoldOut), session.userId));
  } catch (err) {
    return adminAuthError(err);
  }
}
