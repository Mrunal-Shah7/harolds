// SPRINT-8 / SPRINT-12: every admin HTTP path is declared with an explicit role (default-deny).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AdminRole } from "@harolds/types";
import { ADMIN_ROUTE_REGISTRY } from "@/lib/admin-route-registry";

describe("admin route policy", () => {
  it("rejects staff on every admin endpoint and reserves staff/tax surfaces for owner", () => {
    const entries = Object.entries(ADMIN_ROUTE_REGISTRY);
    assert.ok(entries.length >= 30);
    for (const [path, minRole] of entries) {
      assert.notEqual(minRole, AdminRole.STAFF, path);
      assert.ok(minRole === "MANAGER" || minRole === "OWNER", path);
    }
    const ownerOnly = entries.filter(([, r]) => r === "OWNER").map(([p]) => p);
    assert.ok(ownerOnly.some((p) => p.includes("/staff")));
    assert.ok(ownerOnly.some((p) => p.includes("/audit")));
  });

  it("declares Sprint 12 merchandising and override routes", () => {
    assert.equal(ADMIN_ROUTE_REGISTRY["POST /api/internal/admin/menu/items/[id]/image"], "MANAGER");
    assert.equal(ADMIN_ROUTE_REGISTRY["DELETE /api/internal/admin/menu/items/[id]/image"], "MANAGER");
    assert.equal(ADMIN_ROUTE_REGISTRY["POST /api/internal/admin/menu/reorder"], "MANAGER");
    assert.equal(ADMIN_ROUTE_REGISTRY["POST /api/internal/admin/store/overrides"], "MANAGER");
    assert.equal(
      ADMIN_ROUTE_REGISTRY["POST /api/internal/admin/store/overrides/[id]/cancel"],
      "MANAGER",
    );
  });

  it("default-denies an undeclared path key", () => {
    assert.equal(ADMIN_ROUTE_REGISTRY["POST /api/internal/admin/undocumented"], undefined);
  });
});
