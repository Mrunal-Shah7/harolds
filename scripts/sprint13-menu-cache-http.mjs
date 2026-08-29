#!/usr/bin/env node
// SPRINT-13: prove every admin menu mutation class is visible on the immediately
// following public GET /api/v1/menu (in-process cache + Next force-dynamic / no-cache).
// Also confirms conditional requests still return 304 when nothing changed.
const base = process.env.APP_BASE_URL || "http://127.0.0.1:3000";

let failures = 0;
function fail(msg) {
  console.error(`FAIL ${msg}`);
  failures += 1;
}
function ok(msg) {
  console.log(`ok ${msg}`);
}

async function waitForUp() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/v1/health`, { redirect: "manual" });
      if (res.status === 200 || res.status === 503) return;
    } catch {
      /* not up */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("server did not become reachable");
}

async function getMenu() {
  const res = await fetch(`${base}/api/v1/menu`, { cache: "no-store" });
  if (res.status !== 200) throw new Error(`menu ${res.status}`);
  const cc = res.headers.get("cache-control") ?? "";
  const etag = res.headers.get("etag");
  const json = await res.json();
  return { etag, cc, body: json.data, headers: res.headers };
}

function allItems(menu) {
  return (menu?.categories ?? []).flatMap((c) =>
    (c.items ?? []).map((i) => ({ ...i, categoryId: c.id, categoryName: c.name })),
  );
}

async function adminSignin() {
  const signin = await fetch(`${base}/api/internal/admin/auth/signin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "test-owner@localhost", password: "HaroldsOwner1!" }),
  });
  if (signin.status !== 200) throw new Error(`admin signin ${signin.status} ${await signin.text()}`);
  const setCookie = signin.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";")[0];
  if (!cookie.startsWith("harolds_admin=")) throw new Error(`no admin cookie: ${setCookie}`);
  return cookie;
}

async function assertImmediate(label, cookie, mutate, assertFn) {
  const before = await getMenu();
  if (!/no-cache/i.test(before.cc) || !/must-revalidate/i.test(before.cc)) {
    fail(`${label}: unexpected Cache-Control (framework layer) "${before.cc}"`);
  } else {
    ok(`${label}: Cache-Control no-cache,must-revalidate (framework layer)`);
  }

  await mutate(cookie, before);

  const after = await getMenu();
  if (after.etag === before.etag) fail(`${label}: ETag unchanged after mutation`);
  try {
    assertFn(before.body, after.body, before, after);
    ok(`${label}: visible on immediately following public menu request (etag ${before.etag} → ${after.etag})`);
  } catch (err) {
    fail(`${label}: ${err instanceof Error ? err.message : err}`);
  }
  return after;
}

/** Minimal valid 1×1 PNG. */
function tinyPngBytes() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
}

await waitForUp();
const cookie = await adminSignin();

// Baseline 304 when unchanged
{
  const m1 = await getMenu();
  const nm = await fetch(`${base}/api/v1/menu`, {
    headers: { "if-none-match": m1.etag ?? "" },
    cache: "no-store",
  });
  if (nm.status !== 304) fail(`conditional menu ${nm.status} etag=${m1.etag}`);
  else ok(`conditional menu 304 etag=${m1.etag}`);
}

const items = allItems((await getMenu()).body);
const subject = items.find((i) => i.isSoldOut === false && i.isActive !== false);
if (!subject?.id) {
  fail("no mutable in-stock item on public menu");
  process.exit(1);
}

const otherCategory = (await getMenu()).body.categories.find((c) => c.id !== subject.categoryId);
const originalCategoryId = subject.categoryId;
let originalPrice = subject.basePriceCents ?? subject.priceCents;
if (originalPrice == null) {
  // Public shape uses basePriceCents in contract 1.3.0.
  const adminItem = await fetch(`${base}/api/internal/admin/menu/items/${subject.id}`, {
    headers: { cookie },
  });
  const adminJson = await adminItem.json();
  originalPrice = adminJson.data?.basePriceCents ?? 899;
}

const dollars = ((originalPrice + 1) / 100).toFixed(2);
const restorePrice = (originalPrice / 100).toFixed(2);

// 1) Price edit
await assertImmediate(
  "price edit",
  cookie,
  async (c) => {
    const res = await fetch(`${base}/api/internal/admin/menu/items/${subject.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: c },
      body: JSON.stringify({ price: dollars }),
    });
    if (res.status !== 200) throw new Error(`PATCH price ${res.status} ${await res.text()}`);
  },
  (_b, after) => {
    const found = allItems(after).find((i) => i.id === subject.id);
    if (!found) throw new Error("item missing after price edit");
    const cents = found.basePriceCents ?? found.priceCents;
    if (cents !== originalPrice + 1) throw new Error(`price ${cents} expected ${originalPrice + 1}`);
  },
);

// restore price
await fetch(`${base}/api/internal/admin/menu/items/${subject.id}`, {
  method: "PATCH",
  headers: { "content-type": "application/json", cookie },
  body: JSON.stringify({ price: restorePrice }),
});

// 2) Item deactivation
await assertImmediate(
  "item deactivation",
  cookie,
  async (c) => {
    const res = await fetch(`${base}/api/internal/admin/menu/items/${subject.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: c },
      body: JSON.stringify({ isActive: false }),
    });
    if (res.status !== 200) throw new Error(`deactivate ${res.status} ${await res.text()}`);
  },
  (_b, after) => {
    const found = allItems(after).find((i) => i.id === subject.id);
    if (found) throw new Error("inactive item still on public menu");
  },
);

await fetch(`${base}/api/internal/admin/menu/items/${subject.id}`, {
  method: "PATCH",
  headers: { "content-type": "application/json", cookie },
  body: JSON.stringify({ isActive: true }),
});

// 3) Sold-out toggle
await assertImmediate(
  "sold-out toggle",
  cookie,
  async (c) => {
    const res = await fetch(`${base}/api/internal/admin/menu/items/${subject.id}/sold-out`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: c },
      body: JSON.stringify({ isSoldOut: true }),
    });
    if (res.status !== 200) throw new Error(`sold-out on ${res.status} ${await res.text()}`);
  },
  (_b, after) => {
    const found = allItems(after).find((i) => i.id === subject.id);
    if (!found?.isSoldOut) throw new Error("sold-out not visible");
  },
);

await fetch(`${base}/api/internal/admin/menu/items/${subject.id}/sold-out`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie },
  body: JSON.stringify({ isSoldOut: false }),
});

// 4) Image attach
let attachedHash = null;
await assertImmediate(
  "image attach",
  cookie,
  async (c) => {
    const form = new FormData();
    const blob = new Blob([tinyPngBytes()], { type: "image/png" });
    form.append("file", blob, "sprint13-probe.png");
    const res = await fetch(`${base}/api/internal/admin/menu/items/${subject.id}/image`, {
      method: "POST",
      headers: { cookie: c },
      body: form,
    });
    if (res.status !== 200) throw new Error(`image upload ${res.status} ${await res.text()}`);
    const json = await res.json();
    attachedHash = json.data?.hash ?? null;
  },
  (_b, after) => {
    const found = allItems(after).find((i) => i.id === subject.id);
    if (!found?.imageUrl) throw new Error("imageUrl missing after attach");
    if (!found.imageDerivatives?.thumb?.webp) throw new Error("imageDerivatives missing after attach");
  },
);

if (attachedHash) {
  for (const pathSuffix of [
    `original`,
    `thumb`,
    `thumb.webp`,
    `modal`,
    `modal.webp`,
    `preview`,
    `preview.webp`,
  ]) {
    const url = `${base}/api/v1/media/${attachedHash}/${pathSuffix}`;
    const res = await fetch(url, { cache: "no-store" });
    if (res.status !== 200) fail(`derivative ${pathSuffix} → ${res.status}`);
    else ok(`derivative ${pathSuffix} → 200`);
  }
}

// 5) Image removal
await assertImmediate(
  "image removal",
  cookie,
  async (c) => {
    const res = await fetch(`${base}/api/internal/admin/menu/items/${subject.id}/image`, {
      method: "DELETE",
      headers: { cookie: c },
    });
    if (res.status !== 200) throw new Error(`image delete ${res.status} ${await res.text()}`);
  },
  (_b, after) => {
    const found = allItems(after).find((i) => i.id === subject.id);
    if (found?.imageUrl) throw new Error("imageUrl still set after removal");
    if (found?.imageDerivatives) throw new Error("imageDerivatives still set after removal");
  },
);

// 6) Reorder (two items in same category)
{
  const menu = (await getMenu()).body;
  const cat = menu.categories.find((c) => (c.items?.length ?? 0) >= 2) ?? menu.categories[0];
  const ordered = [...(cat?.items ?? [])].map((i) => i.id);
  if (ordered.length < 2) {
    fail("reorder: need ≥2 items in a category");
  } else {
    const swapped = [ordered[1], ordered[0], ...ordered.slice(2)];
    await assertImmediate(
      "reorder",
      cookie,
      async (c) => {
        const res = await fetch(`${base}/api/internal/admin/menu/reorder`, {
          method: "POST",
          headers: { "content-type": "application/json", cookie: c },
          body: JSON.stringify({ kind: "items", orderedIds: swapped }),
        });
        if (res.status !== 200) throw new Error(`reorder ${res.status} ${await res.text()}`);
      },
      (_b, after) => {
        const afterCat = after.categories.find((c) => c.id === cat.id);
        const ids = (afterCat?.items ?? []).map((i) => i.id);
        if (ids[0] !== swapped[0] || ids[1] !== swapped[1]) {
          throw new Error(`order ${ids.slice(0, 2).join(",")} expected ${swapped.slice(0, 2).join(",")}`);
        }
      },
    );
    // restore original order
    await fetch(`${base}/api/internal/admin/menu/reorder`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ kind: "items", orderedIds: ordered }),
    });
  }
}

// 7) Category change
if (!otherCategory?.id) {
  fail("category change: no second category");
} else {
  await assertImmediate(
    "category change",
    cookie,
    async (c) => {
      const res = await fetch(`${base}/api/internal/admin/menu/items/${subject.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: c },
        body: JSON.stringify({ categoryId: otherCategory.id }),
      });
      if (res.status !== 200) throw new Error(`category PATCH ${res.status} ${await res.text()}`);
    },
    (_b, after) => {
      const found = allItems(after).find((i) => i.id === subject.id);
      if (!found) throw new Error("item missing after category move");
      if (found.categoryId !== otherCategory.id) {
        throw new Error(`categoryId ${found.categoryId} expected ${otherCategory.id}`);
      }
    },
  );
  await fetch(`${base}/api/internal/admin/menu/items/${subject.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ categoryId: originalCategoryId }),
  });
}

// Final 304 still works after restore mutations settle
{
  const m = await getMenu();
  const nm = await fetch(`${base}/api/v1/menu`, {
    headers: { "if-none-match": m.etag ?? "" },
    cache: "no-store",
  });
  if (nm.status !== 304) fail(`final conditional menu ${nm.status}`);
  else ok(`final conditional menu 304 etag=${m.etag}`);
}

if (failures) {
  console.error(`sprint13-menu-cache-http FAILED (${failures})`);
  process.exit(1);
}
console.log("sprint13-menu-cache-http passed");
