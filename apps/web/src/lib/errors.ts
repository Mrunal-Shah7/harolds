// SPRINT-9: error capture with the same redaction as logs. Sentry is optional.
import { emitLog, env, redactFields } from "@harolds/config";
import { getRequestId } from "@/lib/request-context";

export type CapturedError = {
  at: string;
  message: string;
  name: string;
  requestId?: string;
  context: Record<string, unknown>;
};

const RING_MAX = 20;
const ring: CapturedError[] = [];

export function recentCapturedErrors(): CapturedError[] {
  return [...ring];
}

export function clearCapturedErrors(): void {
  ring.length = 0;
}

function asError(err: unknown): { name: string; message: string; stack?: string } {
  if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack };
  return { name: "Error", message: String(err) };
}

export async function captureException(
  err: unknown,
  context: Record<string, unknown> = {},
): Promise<void> {
  const info = asError(err);
  const requestId = getRequestId();
  const safeContext = redactFields(context) as Record<string, unknown>;
  const entry: CapturedError = {
    at: new Date().toISOString(),
    message: info.message,
    name: info.name,
    requestId,
    context: safeContext,
  };
  ring.push(entry);
  if (ring.length > RING_MAX) ring.shift();

  emitLog(
    "error",
    "error.captured",
    {
      name: info.name,
      message: info.message,
      ...safeContext,
    },
    { requestId, scope: "error" },
  );

  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn) return;
  try {
    await postSentryEvent(dsn, entry, info.stack);
  } catch (sendErr) {
    emitLog("warn", "error.sentry_send_failed", { message: String(sendErr) }, { requestId, scope: "error" });
  }
}

function parseDsn(dsn: string): { url: string; key: string; project: string } | null {
  try {
    const u = new URL(dsn);
    const project = u.pathname.replace(/^\//, "").split("/")[0];
    if (!project) return null;
    return {
      url: `${u.protocol}//${u.host}/api/${project}/store/`,
      key: u.username,
      project,
    };
  } catch {
    return null;
  }
}

async function postSentryEvent(dsn: string, entry: CapturedError, stack?: string): Promise<void> {
  const parsed = parseDsn(dsn);
  if (!parsed) return;
  const payload = redactFields({
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: entry.at,
    platform: "node",
    message: entry.message,
    exception: { values: [{ type: entry.name, value: entry.message, stacktrace: stack ? { frames: [{ filename: "app", function: stack.slice(0, 500) }] } : undefined }] },
    tags: { requestId: entry.requestId ?? "" },
    extra: entry.context,
  });
  await fetch(parsed.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${parsed.key}, sentry_client=harolds/9.0`,
    },
    body: JSON.stringify(payload),
  });
}
