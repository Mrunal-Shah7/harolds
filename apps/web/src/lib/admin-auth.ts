// SPRINT-8 / SPRINT-12: require a manager/owner ADMIN-purpose session; default-deny via registry.
import { AdminRole, type AdminRole as AdminRoleT } from "@harolds/types";
import { assertMinRole, resolveAdminSession, type ResolvedAdminSession } from "@harolds/db";
import { readAdminToken } from "@/lib/admin-http";
import { assertNotRateLimited } from "@/lib/enforce-rate-limit";
import { ADMIN_ROUTE_REGISTRY, AdminRouteDeniedError, type AdminRouteMinRole } from "@/lib/admin-route-registry";

function normaliseAdminPath(pathname: string): string {
  // Collapse dynamic segments to [id] for registry lookup.
  return pathname
    .replace(/\/api\/internal\/admin\/menu\/items\/[^/]+\/image$/, "/api/internal/admin/menu/items/[id]/image")
    .replace(/\/api\/internal\/admin\/menu\/items\/[^/]+\/sold-out$/, "/api/internal/admin/menu/items/[id]/sold-out")
    .replace(/\/api\/internal\/admin\/menu\/items\/[^/]+\/bindings$/, "/api/internal/admin/menu/items/[id]/bindings")
    .replace(/\/api\/internal\/admin\/menu\/items\/[^/]+$/, "/api/internal/admin/menu/items/[id]")
    .replace(/\/api\/internal\/admin\/menu\/categories\/[^/]+$/, "/api/internal/admin/menu/categories/[id]")
    .replace(/\/api\/internal\/admin\/modifiers\/options\/[^/]+$/, "/api/internal/admin/modifiers/options/[id]")
    .replace(/\/api\/internal\/admin\/modifiers\/[^/]+\/options$/, "/api/internal/admin/modifiers/[id]/options")
    .replace(/\/api\/internal\/admin\/modifiers\/[^/]+\/bindings$/, "/api/internal/admin/modifiers/[id]/bindings")
    .replace(/\/api\/internal\/admin\/modifiers\/[^/]+$/, "/api/internal/admin/modifiers/[id]")
    .replace(/\/api\/internal\/admin\/store\/closures\/[^/]+$/, "/api/internal/admin/store/closures/[id]")
    .replace(
      /\/api\/internal\/admin\/store\/overrides\/[^/]+\/cancel$/,
      "/api/internal/admin/store/overrides/[id]/cancel",
    )
    .replace(/\/api\/internal\/admin\/orders\/[^/]+\/refund$/, "/api/internal/admin/orders/[id]/refund")
    .replace(/\/api\/internal\/admin\/orders\/[^/]+\/cancel$/, "/api/internal/admin/orders/[id]/cancel")
    .replace(/\/api\/internal\/admin\/orders\/[^/]+\/reprint$/, "/api/internal/admin/orders/[id]/reprint")
    .replace(/\/api\/internal\/admin\/orders\/[^/]+\/status$/, "/api/internal/admin/orders/[id]/status")
    .replace(/\/api\/internal\/admin\/orders\/[^/]+$/, "/api/internal/admin/orders/[id]")
    .replace(/\/api\/internal\/admin\/jobs\/[^/]+$/, "/api/internal/admin/jobs/[id]")
    .replace(/\/api\/internal\/admin\/staff\/[^/]+\/sessions$/, "/api/internal/admin/staff/[id]/sessions")
    .replace(/\/api\/internal\/admin\/staff\/[^/]+$/, "/api/internal/admin/staff/[id]");
}

export async function requireAdmin(
  request: Request,
  minRole: AdminRouteMinRole = AdminRole.MANAGER,
): Promise<ResolvedAdminSession> {
  assertNotRateLimited(request, "adminApi");

  const url = new URL(request.url);
  const key = `${request.method.toUpperCase()} ${normaliseAdminPath(url.pathname)}`;
  const declared = ADMIN_ROUTE_REGISTRY[key];
  if (!declared) {
    throw new AdminRouteDeniedError(
      `Admin route "${key}" has no explicit role declaration (default-deny).`,
    );
  }
  // Caller may request a higher bar than the registry (e.g. OWNER); never lower.
  const effective: AdminRouteMinRole =
    declared === AdminRole.OWNER || minRole === AdminRole.OWNER ? AdminRole.OWNER : AdminRole.MANAGER;

  const session = await resolveAdminSession(readAdminToken(request));
  assertMinRole(session.role, effective);
  return session;
}

export type { AdminRoleT };
export { assertAdminRouteDeclared, AdminRouteDeniedError } from "@/lib/admin-route-registry";
