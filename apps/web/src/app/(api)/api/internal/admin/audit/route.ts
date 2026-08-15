// SPRINT-8: GET /api/internal/admin/audit — money-affecting actions with acting user.
import { AdminRole } from "@harolds/types";
import { listAdminAudit } from "@harolds/db";
import { requireAdmin } from "@/lib/admin-auth";
import { adminAuthError, adminOk } from "@/lib/admin-http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    await requireAdmin(request, AdminRole.OWNER);
    const url = new URL(request.url);
    const take = Number(url.searchParams.get("take") ?? "100");
    const rows = await listAdminAudit({ take });
    return adminOk(
      rows.map((r) => ({
        id: r.id,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        summary: r.summary,
        createdAt: r.createdAt.toISOString(),
        user: r.user
          ? { id: r.user.id, displayName: r.user.displayName, role: r.user.role }
          : null,
      })),
    );
  } catch (err) {
    return adminAuthError(err);
  }
}
