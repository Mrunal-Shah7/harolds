// SPRINT-8: admin back-office session lifetime and password lockout.
import { env } from "./env";

export type AdminConfig = {
  sessionTtlMs: number;
  maxPasswordFailures: number;
  passwordLockoutMs: number;
};

/**
 * Defaults used when the corresponding env var is unset.
 *
 * Session is shorter than the kitchen display's 12-hour shift token: an admin
 * session can refund money and change prices, and the device is not a mounted
 * kitchen tablet.
 *
 * Lockout is longer than the PIN window (5 minutes) because a password is
 * typed, not a four-digit pad, and a slower hash already rate-limits guesses.
 */
export const ADMIN_DEFAULTS: AdminConfig = {
  sessionTtlMs: 4 * 60 * 60 * 1000,
  maxPasswordFailures: 5,
  passwordLockoutMs: 15 * 60 * 1000,
};

export function getAdminConfig(): AdminConfig {
  return {
    sessionTtlMs: env.ADMIN_SESSION_TTL_MS ?? ADMIN_DEFAULTS.sessionTtlMs,
    maxPasswordFailures: env.ADMIN_PASSWORD_MAX_FAILURES ?? ADMIN_DEFAULTS.maxPasswordFailures,
    passwordLockoutMs: env.ADMIN_PASSWORD_LOCKOUT_MS ?? ADMIN_DEFAULTS.passwordLockoutMs,
  };
}
