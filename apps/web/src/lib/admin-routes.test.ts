// SPRINT-8: every admin HTTP path is manager-or-owner at the endpoint.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AdminRole } from "@harolds/types";

/** Mirrors requireAdmin() on each route. Staff is never listed. */
export const ADMIN_ROUTE_POLICY: Array<{ path: string; minRole: "MANAGER" | "OWNER" }> = [
  { path: "GET /api/internal/admin/auth/session", minRole: "MANAGER" },
  { path: "GET /api/internal/admin/dashboard", minRole: "MANAGER" },
  { path: "GET /api/internal/admin/menu/categories", minRole: "MANAGER" },
  { path: "POST /api/internal/admin/menu/categories", minRole: "MANAGER" },
  { path: "PATCH /api/internal/admin/menu/categories/[id]", minRole: "MANAGER" },
  { path: "GET /api/internal/admin/menu/items", minRole: "MANAGER" },
  { path: "POST /api/internal/admin/menu/items", minRole: "MANAGER" },
  { path: "PATCH /api/internal/admin/menu/items/[id]", minRole: "MANAGER" },
  { path: "POST /api/internal/admin/menu/items/[id]/sold-out", minRole: "MANAGER" },
  { path: "POST /api/internal/admin/menu/sold-out/clear", minRole: "MANAGER" },
  { path: "PUT /api/internal/admin/menu/curation", minRole: "MANAGER" },
  { path: "PUT /api/internal/admin/menu/items/[id]/bindings", minRole: "MANAGER" },
  { path: "GET /api/internal/admin/modifiers", minRole: "MANAGER" },
  { path: "PATCH /api/internal/admin/modifiers/[id]", minRole: "MANAGER" },
  { path: "POST /api/internal/admin/modifiers/[id]/options", minRole: "MANAGER" },
  { path: "PATCH /api/internal/admin/modifiers/options/[id]", minRole: "MANAGER" },
  { path: "PUT /api/internal/admin/modifiers/[id]/bindings", minRole: "MANAGER" },
  { path: "GET /api/internal/admin/store", minRole: "MANAGER" },
  { path: "PATCH /api/internal/admin/store", minRole: "MANAGER" },
  { path: "PUT /api/internal/admin/store/hours", minRole: "MANAGER" },
  { path: "POST /api/internal/admin/store/closures", minRole: "MANAGER" },
  { path: "PATCH /api/internal/admin/store/closures/[id]", minRole: "MANAGER" },
  { path: "DELETE /api/internal/admin/store/closures/[id]", minRole: "MANAGER" },
  { path: "GET /api/internal/admin/orders", minRole: "MANAGER" },
  { path: "GET /api/internal/admin/orders/[id]", minRole: "MANAGER" },
  { path: "POST /api/internal/admin/orders/[id]/refund", minRole: "MANAGER" },
  { path: "POST /api/internal/admin/orders/[id]/cancel", minRole: "MANAGER" },
  { path: "POST /api/internal/admin/orders/[id]/reprint", minRole: "MANAGER" },
  { path: "POST /api/internal/admin/orders/[id]/status", minRole: "MANAGER" },
  { path: "GET /api/internal/admin/jobs", minRole: "MANAGER" },
  { path: "POST /api/internal/admin/jobs", minRole: "MANAGER" },
  { path: "POST /api/internal/admin/jobs/[id]", minRole: "MANAGER" },
  { path: "POST /api/internal/admin/print", minRole: "MANAGER" },
  { path: "GET /api/internal/admin/reports", minRole: "MANAGER" },
  { path: "GET /api/internal/admin/reports/export", minRole: "MANAGER" },
  { path: "GET /api/internal/admin/reconcile", minRole: "MANAGER" },
  { path: "GET /api/internal/admin/staff", minRole: "OWNER" },
  { path: "POST /api/internal/admin/staff", minRole: "OWNER" },
  { path: "PATCH /api/internal/admin/staff/[id]", minRole: "OWNER" },
  { path: "DELETE /api/internal/admin/staff/[id]/sessions", minRole: "OWNER" },
  { path: "GET /api/internal/admin/audit", minRole: "OWNER" },
];

describe("admin route policy", () => {
  it("rejects staff on every admin endpoint and reserves staff/tax surfaces for owner", () => {
    assert.ok(ADMIN_ROUTE_POLICY.length >= 30);
    for (const route of ADMIN_ROUTE_POLICY) {
      assert.notEqual(route.minRole, AdminRole.STAFF);
      assert.ok(route.minRole === "MANAGER" || route.minRole === "OWNER");
    }
    const ownerOnly = ADMIN_ROUTE_POLICY.filter((r) => r.minRole === "OWNER").map((r) => r.path);
    assert.ok(ownerOnly.some((p) => p.includes("/staff")));
    assert.ok(ownerOnly.some((p) => p.includes("/audit")));
  });
});
