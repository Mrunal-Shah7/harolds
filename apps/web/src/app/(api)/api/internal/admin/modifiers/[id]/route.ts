// SPRINT-8: GET/PATCH /api/internal/admin/modifiers/[id]
import { getAdminModifierGroup, updateModifierGroup } from "@harolds/db";
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
    const row = await getAdminModifierGroup(id);
    if (!row) return adminFail(AdminErrorCode.NOT_FOUND, "Modifier group not found.");
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
    const body = parsed.value as {
      name?: string;
      prompt?: string;
      isRequired?: boolean;
      minSelect?: number;
      maxSelect?: number;
      sortOrder?: number;
      isActive?: boolean;
    };
    return adminOk(await updateModifierGroup(id, body, session.userId));
  } catch (err) {
    return adminAuthError(err);
  }
}
