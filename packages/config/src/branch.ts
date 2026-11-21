// Branch identity: which Harold's location this deployment serves. Stated once, here — every
// branded string (storefront header and footer, back office and kitchen titles, the Apple Pay
// sheet, the SEO fallbacks, the seed's store name) is derived from STORE_BRANCH_NAME, so a second
// location is a new .env and database, not a code change.
//
// Read on the server only. Client components get it through the BranchProvider the root layout
// mounts (apps/web/src/components/branch-context.tsx). Pages that are prerendered at build time
// bake it in, so set it before `pnpm build` and rebuild after changing it.
import { env } from "./env";

/** The location this codebase was first built for; used when STORE_BRANCH_NAME is unset. */
export const DEFAULT_BRANCH_NAME = "Burnham";

export type BranchConfig = {
  /** The location on its own, e.g. "Burnham". */
  branchName: string;
  /** Full public name, e.g. "Harold's Chicken Burnham". Page titles, wallet sheet, SEO. */
  siteName: string;
  /** Short form for tight spaces, e.g. "Harold's Burnham". The kitchen sign-in card. */
  shortName: string;
};

export function branchConfigFor(branchName: string): BranchConfig {
  return {
    branchName,
    siteName: `Harold's Chicken ${branchName}`,
    shortName: `Harold's ${branchName}`,
  };
}

export function getBranchConfig(): BranchConfig {
  return branchConfigFor(env.STORE_BRANCH_NAME ?? DEFAULT_BRANCH_NAME);
}
