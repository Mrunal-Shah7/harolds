// SPRINT-16: the PAYMENT_FAILED retry lockout, as a persisted DEADLINE rather than a countdown
// held in component state.
//
// The pre-Sprint-16 lockout was `useState(15)` ticking down, so a page reload cleared it
// instantly — on the one screen where reloading is the most likely thing a customer does.
// Storing an absolute deadline in sessionStorage means the remaining time is derived on every
// mount and survives the reload.
//
// This is DEFENCE IN DEPTH, not the guarantee. A cleared browser, a second tab, or a different
// device defeats it entirely. The guarantee is the server-side duplicate guard in lib/checkout.ts
// (Phase 4). Nothing here justifies weakening that.
//
// The pure function below is separated from storage so the clamping rules can be tested without
// a DOM.

/** design.md §9.3 / Sprint 14 Phase 7.4. */
export const FAILED_RETRY_LOCKOUT_SECONDS = 15;

export const LOCKOUT_STORAGE_KEY = "harolds.checkout.lockoutUntil.v1";

/**
 * Seconds still to wait, given a deadline and the current time.
 *
 * Two rules beyond the arithmetic:
 *   - a deadline in the past (or absent, or unparseable) yields 0, never a negative countdown;
 *   - the result is capped at `maxSeconds`, so a customer whose device clock is wrong — or who
 *     edits the stored value — cannot be locked out for longer than the configured duration.
 */
export function remainingLockoutSeconds(
  deadlineMs: number | null,
  nowMs: number,
  maxSeconds: number = FAILED_RETRY_LOCKOUT_SECONDS,
): number {
  if (deadlineMs == null || !Number.isFinite(deadlineMs)) return 0;
  const remaining = Math.ceil((deadlineMs - nowMs) / 1000);
  if (remaining <= 0) return 0;
  return Math.min(remaining, maxSeconds);
}

/** Read the persisted deadline. Returns null when absent, unparseable, or storage is blocked. */
export function readLockoutDeadline(): number | null {
  try {
    const raw = window.sessionStorage.getItem(LOCKOUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Write a deadline `seconds` from now. Non-fatal if storage is unavailable. */
export function writeLockoutDeadline(
  nowMs: number,
  seconds: number = FAILED_RETRY_LOCKOUT_SECONDS,
): number {
  const deadline = nowMs + seconds * 1000;
  try {
    window.sessionStorage.setItem(LOCKOUT_STORAGE_KEY, String(deadline));
  } catch {
    // Private mode or blocked storage — the countdown still runs for this page's lifetime, and
    // the server-side guard is unaffected.
  }
  return deadline;
}

export function clearLockoutDeadline(): void {
  try {
    window.sessionStorage.removeItem(LOCKOUT_STORAGE_KEY);
  } catch {
    // Non-fatal.
  }
}
