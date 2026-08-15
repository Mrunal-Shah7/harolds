// SPRINT-9: worker last-pass timestamp for the health check.
// Stored on globalThis so instrumentation and route handlers share one clock in Next.js.
type Heartbeat = { lastPassAt: Date | null; startedAt: Date | null };

const g = globalThis as unknown as { __haroldsWorkerHeartbeat?: Heartbeat };

function state(): Heartbeat {
  if (!g.__haroldsWorkerHeartbeat) {
    g.__haroldsWorkerHeartbeat = { lastPassAt: null, startedAt: null };
  }
  return g.__haroldsWorkerHeartbeat;
}

export function markWorkerStarted(at = new Date()): void {
  state().startedAt = at;
}

export function markWorkerPass(at = new Date()): void {
  state().lastPassAt = at;
}

export function getWorkerHeartbeat(): Heartbeat {
  const s = state();
  return { lastPassAt: s.lastPassAt, startedAt: s.startedAt };
}

export function resetWorkerHeartbeat(): void {
  const s = state();
  s.lastPassAt = null;
  s.startedAt = null;
}
