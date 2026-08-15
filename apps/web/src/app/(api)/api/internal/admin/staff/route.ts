// SPRINT-8: GET/POST /api/internal/admin/staff — owner only.
import { AdminRole } from "@harolds/types";
import { createAdminUser, listAdminUsers } from "@harolds/db";
import { requireAdmin } from "@/lib/admin-auth";
import { adminAuthError, adminOk } from "@/lib/admin-http";
import { readAdminJson } from "@/lib/admin-body";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    await requireAdmin(request, AdminRole.OWNER);
    const rows = await listAdminUsers();
    return adminOk(
      rows.map((u) => ({
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        role: u.role,
        isActive: u.isActive,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        lockedUntil: u.lockedUntil?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
        hasPin: Boolean(u.pinHash),
      })),
    );
  } catch (err) {
    return adminAuthError(err);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdmin(request, AdminRole.OWNER);
    const parsed = await readAdminJson(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.value as {
      email?: string;
      displayName?: string;
      role?: string;
      password?: string;
      pin?: string;
    };
    const created = await createAdminUser(
      {
        email: body.email ?? "",
        displayName: body.displayName ?? "",
        role: body.role ?? "STAFF",
        password: body.password ?? "",
        pin: body.pin,
      },
      session.userId,
    );
    return adminOk({ user: created.user, pinOnce: created.pinOnce }, { status: 201 });
  } catch (err) {
    return adminAuthError(err);
  }
}
