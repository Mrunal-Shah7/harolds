// SPRINT-12: default-deny admin route registry — undeclared routes refuse at module load.
import { AdminRole } from "@harolds/types";

export type AdminRouteMinRole = typeof AdminRole.MANAGER | typeof AdminRole.OWNER;

/** Every admin HTTP path that may run must be listed here with an explicit role. */
export const ADMIN_ROUTE_REGISTRY: Record<string, AdminRouteMinRole> = {
  "GET /api/internal/admin/auth/session": AdminRole.MANAGER,
  "POST /api/internal/admin/auth/signout": AdminRole.MANAGER,
  "GET /api/internal/admin/dashboard": AdminRole.MANAGER,
  "GET /api/internal/admin/menu/categories": AdminRole.MANAGER,
  "POST /api/internal/admin/menu/categories": AdminRole.MANAGER,
  "GET /api/internal/admin/menu/categories/[id]": AdminRole.MANAGER,
  "PATCH /api/internal/admin/menu/categories/[id]": AdminRole.MANAGER,
  "POST /api/internal/admin/menu/categories/[id]/image": AdminRole.MANAGER,
  "DELETE /api/internal/admin/menu/categories/[id]/image": AdminRole.MANAGER,
  "GET /api/internal/admin/menu/items": AdminRole.MANAGER,
  "POST /api/internal/admin/menu/items": AdminRole.MANAGER,
  "GET /api/internal/admin/menu/items/[id]": AdminRole.MANAGER,
  "PATCH /api/internal/admin/menu/items/[id]": AdminRole.MANAGER,
  "POST /api/internal/admin/menu/items/[id]/sold-out": AdminRole.MANAGER,
  "POST /api/internal/admin/menu/items/[id]/image": AdminRole.MANAGER,
  "DELETE /api/internal/admin/menu/items/[id]/image": AdminRole.MANAGER,
  "PUT /api/internal/admin/menu/items/[id]/bindings": AdminRole.MANAGER,
  "POST /api/internal/admin/menu/sold-out/clear": AdminRole.MANAGER,
  "GET /api/internal/admin/menu/curation": AdminRole.MANAGER,
  "PUT /api/internal/admin/menu/curation": AdminRole.MANAGER,
  "POST /api/internal/admin/menu/reorder": AdminRole.MANAGER,
  "GET /api/internal/admin/modifiers": AdminRole.MANAGER,
  "POST /api/internal/admin/modifiers": AdminRole.MANAGER,
  "GET /api/internal/admin/modifiers/[id]": AdminRole.MANAGER,
  "PATCH /api/internal/admin/modifiers/[id]": AdminRole.MANAGER,
  "POST /api/internal/admin/modifiers/[id]/options": AdminRole.MANAGER,
  "PUT /api/internal/admin/modifiers/[id]/bindings": AdminRole.MANAGER,
  "PATCH /api/internal/admin/modifiers/options/[id]": AdminRole.MANAGER,
  "GET /api/internal/admin/store": AdminRole.MANAGER,
  "PATCH /api/internal/admin/store": AdminRole.MANAGER,
  "POST /api/internal/admin/store/hero-image": AdminRole.MANAGER,
  "DELETE /api/internal/admin/store/hero-image": AdminRole.MANAGER,
  "PUT /api/internal/admin/store/hours": AdminRole.MANAGER,
  "POST /api/internal/admin/store/closures": AdminRole.MANAGER,
  "PATCH /api/internal/admin/store/closures/[id]": AdminRole.MANAGER,
  "DELETE /api/internal/admin/store/closures/[id]": AdminRole.MANAGER,
  "GET /api/internal/admin/store/overrides": AdminRole.MANAGER,
  "POST /api/internal/admin/store/overrides": AdminRole.MANAGER,
  "POST /api/internal/admin/store/overrides/[id]/cancel": AdminRole.MANAGER,
  "GET /api/internal/admin/orders": AdminRole.MANAGER,
  "GET /api/internal/admin/orders/[id]": AdminRole.MANAGER,
  "POST /api/internal/admin/orders/[id]/refund": AdminRole.MANAGER,
  "POST /api/internal/admin/orders/[id]/cancel": AdminRole.MANAGER,
  "POST /api/internal/admin/orders/[id]/reprint": AdminRole.MANAGER,
  "POST /api/internal/admin/orders/[id]/status": AdminRole.MANAGER,
  "GET /api/internal/admin/jobs": AdminRole.MANAGER,
  "POST /api/internal/admin/jobs": AdminRole.MANAGER,
  "GET /api/internal/admin/jobs/[id]": AdminRole.MANAGER,
  "POST /api/internal/admin/jobs/[id]": AdminRole.MANAGER,
  "POST /api/internal/admin/print": AdminRole.MANAGER,
  "GET /api/internal/admin/reports": AdminRole.MANAGER,
  "GET /api/internal/admin/reports/export": AdminRole.MANAGER,
  "GET /api/internal/admin/reconcile": AdminRole.MANAGER,
  "GET /api/internal/admin/staff": AdminRole.OWNER,
  "POST /api/internal/admin/staff": AdminRole.OWNER,
  "PATCH /api/internal/admin/staff/[id]": AdminRole.OWNER,
  "GET /api/internal/admin/staff/[id]/sessions": AdminRole.OWNER,
  "DELETE /api/internal/admin/staff/[id]/sessions": AdminRole.OWNER,
  "GET /api/internal/admin/audit": AdminRole.OWNER,
};

export class AdminRouteDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminRouteDeniedError";
  }
}

/**
 * Call at module top of every new admin route (optional assertion). An undeclared path
 * is also refused at runtime by requireAdmin (default-deny).
 */
export function assertAdminRouteDeclared(pathKey: string, minRole: AdminRouteMinRole): void {
  const declared = ADMIN_ROUTE_REGISTRY[pathKey];
  if (!declared) {
    throw new AdminRouteDeniedError(
      `Admin route "${pathKey}" is not in ADMIN_ROUTE_REGISTRY — default-deny. Add an explicit role declaration.`,
    );
  }
  if (declared !== minRole) {
    throw new Error(
      `Admin route "${pathKey}" registry role is ${declared} but requireAdmin was called with ${minRole}.`,
    );
  }
}
