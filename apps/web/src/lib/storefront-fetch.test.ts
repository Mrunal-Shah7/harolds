// SPRINT-16 Phase 7: an optional section that fails must be HIDDEN, never fatal to the route.
//
// The home page depends on /api/v1/menu/most-ordered, which was observed 500ing during Sprint 14.
// Sprint 15 read the code and concluded the failure was handled; this proves it by forcing every
// failure shape the endpoint can produce.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fetchSection } from "./storefront-fetch";

function respondWith(init: { status: number; body?: unknown }): typeof fetch {
  return (async () =>
    ({
      ok: init.status >= 200 && init.status < 300,
      status: init.status,
      json: async () => init.body,
    }) as unknown as Response) as unknown as typeof fetch;
}

describe("SPRINT-16 Phase 7: a failed section response hides the section", () => {
  it("returns null on a 500 — the exact failure observed during Sprint 14", async () => {
    const result = await fetchSection("/api/v1/menu/most-ordered", respondWith({ status: 500 }));
    assert.equal(result, null);
  });

  it("returns null on a 404 and on a 429", async () => {
    assert.equal(await fetchSection("/x", respondWith({ status: 404 })), null);
    assert.equal(await fetchSection("/x", respondWith({ status: 429 })), null);
  });

  it("returns null when the network throws", async () => {
    const throwing = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    assert.equal(await fetchSection("/x", throwing), null);
  });

  it("returns null when the body is not the expected envelope", async () => {
    assert.equal(await fetchSection("/x", respondWith({ status: 200, body: {} })), null);
    assert.equal(await fetchSection("/x", respondWith({ status: 200, body: null })), null);
  });

  it("returns null when the body is unparseable JSON", async () => {
    const badJson = (async () =>
      ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token");
        },
      }) as unknown as Response) as unknown as typeof fetch;
    assert.equal(await fetchSection("/x", badJson), null);
  });

  it("returns the data envelope on success, including a legitimately EMPTY curated list", async () => {
    const empty = await fetchSection<{ items: unknown[] }>(
      "/api/v1/menu/most-ordered",
      respondWith({ status: 200, body: { data: { items: [] } } }),
    );
    // This is what the endpoint actually returns locally today: 200 with an empty list, because
    // no item is flagged isMostOrdered. The home page hides the section on `[]` just as it does
    // on `null`, so both paths render the rest of the page.
    assert.deepEqual(empty, { items: [] });

    const populated = await fetchSection<{ items: unknown[] }>(
      "/api/v1/menu/most-ordered",
      respondWith({ status: 200, body: { data: { items: [{ id: "a" }] } } }),
    );
    assert.deepEqual(populated, { items: [{ id: "a" }] });
  });
});
