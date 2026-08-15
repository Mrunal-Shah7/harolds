// SPRINT-8: GET/DELETE /api/internal/admin/staff/[id]/sessions — list and revoke.
import { AdminRole } from "@harolds/types";
import { listUserSessions, revokeUserSessions } from "@harolds/db";
import { requireAdmin } from "@/lib/admin-auth";
import { adminAuthError, adminOk } from "@/lib/admin-http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(request, AdminRole.OWNER);
    const { id } = await ctx.params;
    const rows = await listUserSessions(id);
    return adminOk(
      rows.map((s) => ({
        id: s.id,
        purpose: s.purpose,
        createdAt: s.createdAt.toISOString(),
        lastSeenAt: s.lastSeenAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        ipAddress: s.ipAddress,
        userAgent: s.userAgent ? s.userAgent.slice(0, 80) : null,
      })),
    );
  } catch (err) {
    return adminAuthError(err);
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(request, AdminRole.OWNER);
    const { id } = await ctx.params;
    const count = await revokeUserSessions(id);
    return adminOk({ revoked: count });
  } catch (err) {
    return adminAuthError(err);
  }
}
