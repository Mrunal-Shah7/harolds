// SPRINT-18: database-backed SEO write tests. ALL tests that mutate the SEO singleton rows live in
// this one file, so node:test runs them sequentially and no other test process races the version.
// State is captured before and restored after; audit rows written here are removed.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma, saveSeoConfig, loadSeoSnapshot, SeoVersionConflictError } from "@harolds/db";
import type { SeoSaveRequest, SeoSnapshot } from "@harolds/types";
import { saveSeoSettings } from "@/lib/seo/save";
import { SEO_ROUTES } from "@/lib/seo/routes";

let dbAvailable = true;
let ownerId = "";
let startedAt = new Date();
let original: {
  business: NonNullable<Awaited<ReturnType<typeof prisma.seoBusiness.findUnique>>>;
  hours: Awaited<ReturnType<typeof prisma.seoOpeningHours.findMany>>;
  site: NonNullable<Awaited<ReturnType<typeof prisma.seoSiteDefaults.findUnique>>>;
  routes: Awaited<ReturnType<typeof prisma.seoRouteOverride.findMany>>;
} | null = null;

before(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    startedAt = new Date(Date.now() - 1000);
    ownerId = (await prisma.adminUser.findUnique({ where: { email: "test-owner@localhost" } }))?.id ?? "";
    original = {
      business: (await prisma.seoBusiness.findUnique({ where: { id: "default" } }))!,
      hours: await prisma.seoOpeningHours.findMany(),
      site: (await prisma.seoSiteDefaults.findUnique({ where: { id: "default" } }))!,
      routes: await prisma.seoRouteOverride.findMany(),
    };
  } catch (err) {
    dbAvailable = false;
    console.warn(`[seo save.test] skipping: ${(err as Error).message}`);
  }
});

after(async () => {
  if (!dbAvailable || !original) return;
  const { business, hours, site, routes } = original;
  await prisma.$transaction([
    prisma.seoOpeningHours.deleteMany({}),
    prisma.seoBusiness.update({ where: { id: "default" }, data: { ...business, id: undefined } }),
    prisma.seoOpeningHours.createMany({ data: hours }),
    prisma.seoSiteDefaults.update({ where: { id: "default" }, data: { ...site, id: undefined } }),
    prisma.seoRouteOverride.deleteMany({}),
    prisma.seoRouteOverride.createMany({ data: routes }),
    prisma.adminAuditLog.deleteMany({ where: { action: "SEO_UPDATE", createdAt: { gte: startedAt } } }),
  ]);
});

function requestFrom(s: SeoSnapshot): SeoSaveRequest {
  const { updatedAt: _b, ...business } = s.business;
  const { updatedAt: _s, canonicalHost: _c, ...site } = s.site;
  void _b;
  void _s;
  void _c;
  return {
    expectedVersion: s.version,
    business,
    site,
    routes: SEO_ROUTES.map((r) => ({
      routeKey: r.key,
      title: s.routes[r.key]?.title ?? null,
      description: s.routes[r.key]?.description ?? null,
      ogImageUrl: s.routes[r.key]?.ogImageUrl ?? null,
      breadcrumbLabel: s.routes[r.key]?.breadcrumbLabel ?? null,
      noindex: r.indexable ? (s.routes[r.key]?.noindex ?? false) : true,
    })),
  };
}

const auditCount = () => prisma.adminAuditLog.count({ where: { action: "SEO_UPDATE", createdAt: { gte: startedAt } } });

describe("SPRINT-18 SEO write path (Phase 1.4, Phase 6.2)", () => {
  it("a write bumps the version and writes one audit row per changed field, naming the actor", async () => {
    if (!dbAvailable || !ownerId) return;
    const before = await loadSeoSnapshot();
    const auditsBefore = await auditCount();
    const req = requestFrom(before);
    req.site!.defaultDescription = `${before.site.defaultDescription} (test ${Date.now()})`;
    req.routes!.find((r) => r.routeKey === "menu")!.title = "Menu test title";

    const { snapshot, changes } = await saveSeoConfig(req, { userId: ownerId });
    assert.equal(snapshot.version, before.version + 1);
    assert.deepEqual(changes.map((c) => c.field).sort(), ["defaultDescription", "title"]);
    assert.equal(await auditCount(), auditsBefore + 2);
    const rows = await prisma.adminAuditLog.findMany({ where: { action: "SEO_UPDATE", createdAt: { gte: startedAt } }, orderBy: { createdAt: "desc" }, take: 2 });
    for (const row of rows) {
      assert.equal(row.userId, ownerId);
      const d = row.details as { field: string; before: unknown; after: unknown; version: number };
      assert.ok(d.field && "before" in d && "after" in d);
      assert.equal(d.version, before.version + 1);
    }
  });

  it("a stale version is a conflict and writes nothing", async () => {
    if (!dbAvailable || !ownerId) return;
    const current = await loadSeoSnapshot();
    const auditsBefore = await auditCount();
    const req = requestFrom(current);
    req.expectedVersion = current.version - 1;
    req.site!.siteName = "Should never be written";
    await assert.rejects(() => saveSeoConfig(req, { userId: ownerId }), SeoVersionConflictError);
    const after = await loadSeoSnapshot();
    assert.equal(after.version, current.version);
    assert.equal(after.site.siteName, current.site.siteName);
    assert.equal(await auditCount(), auditsBefore);
  });

  it("a save that changes nothing does not bump the version or audit", async () => {
    if (!dbAvailable || !ownerId) return;
    const current = await loadSeoSnapshot();
    const auditsBefore = await auditCount();
    const { snapshot, changes } = await saveSeoConfig(requestFrom(current), { userId: ownerId });
    assert.equal(changes.length, 0);
    assert.equal(snapshot.version, current.version);
    assert.equal(await auditCount(), auditsBefore);
  });

  it("write, version bump and audit are ONE transaction: a failure part-way leaves nothing behind", async () => {
    if (!dbAvailable || !ownerId) return;
    const current = await loadSeoSnapshot();
    const auditsBefore = await auditCount();
    const req = requestFrom(current);
    req.business!.displayName = "Should roll back";
    // Bypasses validation on purpose: dayOfWeek 9 violates SeoOpeningHours_dayOfWeek_check AFTER
    // the business row has already been updated inside the transaction.
    req.business!.hours = [{ dayOfWeek: 9, isClosed: true, opens: null, closes: null, overnight: false }];
    await assert.rejects(() => saveSeoConfig(req, { userId: ownerId }));
    const after = await loadSeoSnapshot();
    assert.equal(after.business.displayName, current.business.displayName);
    assert.equal(after.version, current.version);
    assert.equal(await auditCount(), auditsBefore);
  });

  it("revalidateTag('seo') runs once, AFTER the transaction has committed", async () => {
    if (!dbAvailable || !ownerId) return;
    const current = await loadSeoSnapshot();
    const req = requestFrom(current);
    req.site!.defaultTitle = `Harold's Chicken Burnham ${Date.now() % 1000}`;
    const events: string[] = [];
    const outcome = await saveSeoSettings(req, { userId: ownerId }, {
      save: async (input, actor) => {
        const result = await saveSeoConfig(input, actor);
        events.push("committed");
        return result;
      },
      revalidate: (tag) => {
        events.push(`revalidate:${tag}`);
      },
    });
    assert.equal(outcome.ok, true);
    assert.deepEqual(events, ["committed", "revalidate:seo"]);

    // And the database a SEPARATE connection sees at revalidation time already holds the new
    // version: an in-transaction revalidation would observe the old one (READ COMMITTED).
    let seenAtRevalidate = -1;
    const req2 = requestFrom(await loadSeoSnapshot());
    req2.site!.defaultTitle = "Harold's Chicken Burnham";
    await saveSeoSettings(req2, { userId: ownerId }, {
      save: saveSeoConfig,
      revalidate: () => {
        // Synchronous callers cannot await; record a promise and check below.
        pending = prisma.seoSiteDefaults.findUnique({ where: { id: "default" } }).then((r) => {
          seenAtRevalidate = r!.version;
        });
      },
    });
    await pending;
    assert.equal(seenAtRevalidate, req2.expectedVersion + 1);
  });

  it("an invalid body is never saved and never revalidates; a no-op does not revalidate", async () => {
    if (!dbAvailable || !ownerId) return;
    const calls: string[] = [];
    const deps = {
      save: async (...args: Parameters<typeof saveSeoConfig>) => {
        calls.push("save");
        return saveSeoConfig(...args);
      },
      revalidate: () => calls.push("revalidate"),
    };
    const bad = requestFrom(await loadSeoSnapshot());
    bad.business!.telephone = "not a phone";
    const outcome = await saveSeoSettings(bad, { userId: ownerId }, deps);
    assert.equal(outcome.ok, false);
    assert.deepEqual(calls, []);
    await saveSeoSettings(requestFrom(await loadSeoSnapshot()), { userId: ownerId }, deps);
    assert.deepEqual(calls, ["save"]);
  });
});

let pending: Promise<void> = Promise.resolve();
