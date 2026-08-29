// SPRINT-16 Phase 7: the server-component fetch helper, extracted from the storefront pages so
// its FAILURE behaviour can be tested.
//
// The home page depends on `/api/v1/menu/most-ordered`, which was observed returning a 500 during
// Sprint 14. Whatever caused that, a failure of an optional section must never take the route
// down with it: the section is hidden and the rest of the page renders. That property was
// previously asserted only by reading the code.
//
// This helper was duplicated inline in both (storefront)/page.tsx and
// (storefront)/menu/page.tsx. It is one function now, with one behaviour.

export function apiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/**
 * Fetch a section's data, returning `null` on ANY failure — a non-2xx status, a network error,
 * or a body that is not the envelope we expect.
 *
 * Callers decide what null means. For a required section (the menu itself) it is an error state;
 * for an optional one (most-ordered) the section is simply not rendered.
 */
export async function fetchSection<T>(
  pathname: string,
  fetchImpl: typeof fetch = fetch,
): Promise<T | null> {
  try {
    const res = await fetchImpl(`${apiBaseUrl()}${pathname}`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: unknown } | null;
    return (body?.data ?? null) as T | null;
  } catch {
    return null;
  }
}
