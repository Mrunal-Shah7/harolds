// SPRINT-18: the admin SEO save — validate, commit, THEN invalidate.
//
// Order matters and is the whole point of this file:
//   1. validate with the shared schema module (the server is the authority);
//   2. write + bump version + audit, in one transaction (saveSeoConfig) — it resolves only after
//      the transaction has COMMITTED;
//   3. revalidateTag("seo"), in-process, after that.
// Revalidating inside the transaction could let a concurrent storefront request repopulate the
// cache from pre-commit state, leaving it stale with no further invalidation coming.
//
// No HTTP hop, no shared secret, no retry job: the storefront reading this data is in the same
// process (pm2 fork mode, one instance). Dependencies are injectable only so a test can prove
// the ordering.
import { revalidateTag } from "next/cache";
import type { SeoSnapshot } from "@harolds/types";
import { saveSeoConfig, type SeoFieldChange } from "@harolds/db";
import { SEO_CACHE_TAG } from "./data";
import { validateSeoSaveRequest, type SeoFieldMessages } from "./validation";

export type SaveSeoDeps = {
  save: typeof saveSeoConfig;
  revalidate: (tag: string) => void;
};

const defaultDeps: SaveSeoDeps = { save: saveSeoConfig, revalidate: (tag) => revalidateTag(tag) };

export type SaveSeoOutcome =
  | { ok: false; errors: SeoFieldMessages; warnings: SeoFieldMessages }
  | {
      ok: true;
      snapshot: SeoSnapshot;
      changes: SeoFieldChange[];
      warnings: SeoFieldMessages;
      /** True when the cache was invalidated, i.e. the storefront's next request shows the change. */
      live: boolean;
    };

export async function saveSeoSettings(
  body: unknown,
  actor: { userId: string | null },
  deps: SaveSeoDeps = defaultDeps,
): Promise<SaveSeoOutcome> {
  const validated = validateSeoSaveRequest(body);
  if (!validated.ok) return validated;

  const { snapshot, changes } = await deps.save(validated.value, actor); // committed when this resolves
  if (changes.length > 0) deps.revalidate(SEO_CACHE_TAG); // after commit — never inside the transaction

  return { ok: true, snapshot, changes, warnings: validated.warnings, live: changes.length > 0 };
}
