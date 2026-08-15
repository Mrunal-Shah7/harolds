// SPRINT-8: POST /api/internal/admin/menu/sold-out/clear — one cache invalidation.
import { clearAllSoldOut } from "@harolds/db";
import { requireAdmin } from "@/lib/admin-auth";
import { adminAuthError, adminOk } from "@/lib/admin-http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    const session = await requireAdmin(request);
    const count = await clearAllSoldOut(session.userId);
    return adminOk({ cleared: count });
  } catch (err) {
    return adminAuthError(err);
  }
}
