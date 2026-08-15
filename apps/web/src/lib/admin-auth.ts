// SPRINT-8: require a manager/owner ADMIN-purpose session on every admin endpoint.
import { AdminRole, type AdminRole as AdminRoleT } from "@harolds/types";
import { assertMinRole, resolveAdminSession, type ResolvedAdminSession } from "@harolds/db";
import { readAdminToken } from "@/lib/admin-http";
import { assertNotRateLimited } from "@/lib/enforce-rate-limit";

export async function requireAdmin(
  request: Request,
  minRole: typeof AdminRole.MANAGER | typeof AdminRole.OWNER = AdminRole.MANAGER,
): Promise<ResolvedAdminSession> {
  assertNotRateLimited(request, "adminApi");
  const session = await resolveAdminSession(readAdminToken(request));
  assertMinRole(session.role, minRole);
  return session;
}

export type { AdminRoleT };
