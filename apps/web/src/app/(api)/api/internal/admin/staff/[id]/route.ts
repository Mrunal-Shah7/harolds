// SPRINT-8: PATCH /api/internal/admin/staff/[id] — owner only; PIN shown once.
import { AdminRole } from "@harolds/types";
import { updateAdminUser } from "@harolds/db";
import { requireAdmin } from "@/lib/admin-auth";
import { adminAuthError, adminOk } from "@/lib/admin-http";
import { readAdminJson } from "@/lib/admin-body";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdmin(request, AdminRole.OWNER);
    const { id } = await ctx.params;
    const parsed = await readAdminJson(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.value as {
      displayName?: string;
      role?: string;
      isActive?: boolean;
      password?: string;
      pin?: string;
    };
    const result = await updateAdminUser(id, body, session.userId);
    return adminOk({ ok: true, pinOnce: result.pinOnce });
  } catch (err) {
    return adminAuthError(err);
  }
}
