// SPRINT-16: the duplicate-order guard's window. Configuration, not a literal, so the operator
// can shorten it without a deploy if the guard's log shows false positives.
import { env } from "./env";

/** design decision: 3 minutes. Long enough to cover a reload and a retry, short enough that a
 *  customer genuinely reordering the same thing is unlikely to be collapsed. */
export const DEFAULT_ORDER_DUPLICATE_GUARD_WINDOW_SECONDS = 180;

export function getOrderDuplicateGuardWindowMs(): number {
  const seconds =
    env.ORDER_DUPLICATE_GUARD_WINDOW_SECONDS ?? DEFAULT_ORDER_DUPLICATE_GUARD_WINDOW_SECONDS;
  return seconds * 1000;
}
