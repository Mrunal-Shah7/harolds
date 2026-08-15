// SPRINT-6: kitchen display knobs — session, lockout, poll, unacknowledged-order alerts.
import { env } from "./env";

export type KitchenConfig = {
  sessionTtlMs: number;
  maxPinFailures: number;
  pinLockoutMs: number;
  pollIntervalMs: number;
  unackScreenMs: number;
  unackSoundMs: number;
  unackAlertMs: number;
};

/** Defaults used when the corresponding env var is unset. */
export const KITCHEN_DEFAULTS: KitchenConfig = {
  // Long enough for an opening-to-close shift plus overlap; short enough that a forgotten
  // signed-in tablet is not a multi-day credential.
  sessionTtlMs: 12 * 60 * 60 * 1000,
  maxPinFailures: 5,
  pinLockoutMs: 5 * 60 * 1000,
  pollIntervalMs: 3_000,
  unackScreenMs: 60_000,
  unackSoundMs: 120_000,
  unackAlertMs: 180_000,
};

export function getKitchenConfig(): KitchenConfig {
  return {
    sessionTtlMs: env.KITCHEN_SESSION_TTL_MS ?? KITCHEN_DEFAULTS.sessionTtlMs,
    maxPinFailures: env.KITCHEN_PIN_MAX_FAILURES ?? KITCHEN_DEFAULTS.maxPinFailures,
    pinLockoutMs: env.KITCHEN_PIN_LOCKOUT_MS ?? KITCHEN_DEFAULTS.pinLockoutMs,
    pollIntervalMs: env.KITCHEN_POLL_INTERVAL_MS ?? KITCHEN_DEFAULTS.pollIntervalMs,
    unackScreenMs: env.KITCHEN_UNACK_SCREEN_MS ?? KITCHEN_DEFAULTS.unackScreenMs,
    unackSoundMs: env.KITCHEN_UNACK_SOUND_MS ?? KITCHEN_DEFAULTS.unackSoundMs,
    unackAlertMs: env.KITCHEN_UNACK_ALERT_MS ?? KITCHEN_DEFAULTS.unackAlertMs,
  };
}
