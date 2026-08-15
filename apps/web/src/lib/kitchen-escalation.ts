// SPRINT-6: on-screen vs audible unacknowledged escalation from paid/printed age.
export type EscalationLevel = "none" | "screen" | "sound";

export function escalationLevel(args: {
  status: string;
  paidAt: string | null;
  nowMs: number;
  screenMs: number;
  soundMs: number;
}): EscalationLevel {
  if (args.status !== "PAID" && args.status !== "PRINTED") return "none";
  if (!args.paidAt) return "none";
  const paidMs = Date.parse(args.paidAt);
  if (Number.isNaN(paidMs)) return "none";
  const age = args.nowMs - paidMs;
  if (age >= args.soundMs) return "sound";
  if (age >= args.screenMs) return "screen";
  return "none";
}

export function formatElapsed(paidAt: string | null, nowMs: number): string {
  if (!paidAt) return "—";
  const paidMs = Date.parse(paidAt);
  if (Number.isNaN(paidMs)) return "—";
  const totalSec = Math.max(0, Math.floor((nowMs - paidMs) / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function nextActionLabel(status: string): string | null {
  switch (status) {
    case "PAID":
    case "PRINTED":
      return "Start";
    case "IN_PROGRESS":
      return "Ready";
    case "READY":
      return "Picked up";
    default:
      return null;
  }
}

export function nextActionStatus(status: string): string | null {
  switch (status) {
    case "PAID":
    case "PRINTED":
      return "IN_PROGRESS";
    case "IN_PROGRESS":
      return "READY";
    case "READY":
      return "PICKED_UP";
    default:
      return null;
  }
}
