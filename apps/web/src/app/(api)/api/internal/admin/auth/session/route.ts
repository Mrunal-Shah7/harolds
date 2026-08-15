// SPRINT-8: GET /api/internal/admin/auth/session — current admin user.
import { requireAdmin } from "@/lib/admin-auth";
import { adminAuthError, adminOk } from "@/lib/admin-http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const session = await requireAdmin(request);
    return adminOk({
      user: {
        id: session.userId,
        email: session.email,
        displayName: session.displayName,
        role: session.role,
      },
      expiresAt: session.expiresAt.toISOString(),
    });
  } catch (err) {
    return adminAuthError(err);
  }
}
