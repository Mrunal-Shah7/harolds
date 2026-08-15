// SPRINT-9: in-process sliding-window limiter. One Node process; no Redis.
import { RATE_LIMITS, isRateLimitExemptPath, type RateBucketName } from "@harolds/config";

type WindowState = { hits: number[] };

const windows = new Map<string, WindowState>();

export type RateLimitDecision =
  | { limited: false }
  | { limited: true; retryAfterSeconds: number; limit: number; remaining: number };

function prune(hits: number[], windowStart: number): number[] {
  let i = 0;
  while (i < hits.length && (hits[i] ?? 0) <= windowStart) i += 1;
  return i === 0 ? hits : hits.slice(i);
}

export function takeRateLimit(args: {
  bucket: RateBucketName;
  clientId: string;
  now?: number;
}): RateLimitDecision {
  const rule = RATE_LIMITS[args.bucket];
  const now = args.now ?? Date.now();
  const key = `${args.bucket}:${args.clientId}`;
  const state = windows.get(key) ?? { hits: [] };
  const kept = prune(state.hits, now - rule.windowMs);
  if (kept.length >= rule.limit) {
    const oldest = kept[0] ?? now;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + rule.windowMs - now) / 1000));
    windows.set(key, { hits: kept });
    return { limited: true, retryAfterSeconds, limit: rule.limit, remaining: 0 };
  }
  kept.push(now);
  windows.set(key, { hits: kept });
  return { limited: false };
}

export function checkPathExemption(pathname: string): boolean {
  return isRateLimitExemptPath(pathname);
}

export function resetRateLimitStore(): void {
  windows.clear();
}
