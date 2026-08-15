// SPRINT-7: in-process background-job worker — same start/stop discipline as the print sweeper.
import { getJobWorkerConfig, emitLog } from "@harolds/config";
import { sendEmail } from "@harolds/email";
import { createDefaultJobRegistry, runWorkerPass } from "@harolds/notify";
import { sendSms } from "@harolds/sms";
import { captureException } from "@/lib/errors";
import { markWorkerPass, markWorkerStarted } from "@/lib/worker-heartbeat";

let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = 0;
let stopping = false;

const registry = createDefaultJobRegistry();

async function tick(): Promise<void> {
  if (stopping) return;
  inFlight += 1;
  try {
    const cfg = getJobWorkerConfig();
    const result = await runWorkerPass({
      registry,
      ports: { sendSms, sendEmail },
      claimLimit: cfg.claimLimit,
      strandedMs: cfg.strandedMs,
      backoffMs: cfg.backoffMs,
    });
    markWorkerPass();
    if (result.claimed > 0 || result.recovered > 0 || result.dead > 0) {
      emitLog(
        "info",
        "jobs.pass",
        {
          claimed: result.claimed,
          recovered: result.recovered,
          succeeded: result.succeeded,
          failed: result.failed,
          dead: result.dead,
        },
        { scope: "jobs" },
      );
    }
  } catch (err) {
    emitLog("error", "jobs.pass_failed", { name: err instanceof Error ? err.name : "Error" }, { scope: "jobs" });
    void captureException(err, { surface: "worker" });
  } finally {
    inFlight -= 1;
  }
}

export function startJobWorker(): void {
  if (timer) return;
  stopping = false;
  const cfg = getJobWorkerConfig();
  timer = setInterval(() => {
    void tick();
  }, cfg.intervalMs);
  timer.unref?.();
  const g = globalThis as unknown as { __haroldsJobWorkerHooks?: boolean };
  if (!g.__haroldsJobWorkerHooks) {
    g.__haroldsJobWorkerHooks = true;
    process.once("SIGTERM", () => {
      void stopJobWorker();
    });
    process.once("SIGINT", () => {
      void stopJobWorker();
    });
  }
  markWorkerStarted();
  emitLog(
    "info",
    "jobs.started",
    { intervalMs: cfg.intervalMs, claimLimit: cfg.claimLimit, strandedMs: cfg.strandedMs },
    { scope: "jobs" },
  );
}

export async function stopJobWorker(): Promise<void> {
  stopping = true;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  const started = Date.now();
  while (inFlight > 0 && Date.now() - started < 10_000) {
    await new Promise((r) => setTimeout(r, 50));
  }
  emitLog("info", "jobs.stopped", {}, { scope: "jobs" });
}

export function isJobWorkerRunning(): boolean {
  return timer !== null;
}
