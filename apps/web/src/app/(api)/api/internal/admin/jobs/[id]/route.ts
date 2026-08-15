// SPRINT-8: GET/POST /api/internal/admin/jobs/[id] — inspect, retry, cancel. Payload redacted.
import {
  cancelBackgroundJob,
  inspectBackgroundJob,
  recordAdminAudit,
  retryDeadJob,
  retryDeadJobsByType,
} from "@harolds/db";
import { AdminErrorCode, JobType } from "@harolds/types";
import { requireAdmin } from "@/lib/admin-auth";
import { adminAuthError, adminFail, adminOk } from "@/lib/admin-http";
import { redactEmail, redactPhone } from "@harolds/db";
import { readAdminJson } from "@/lib/admin-body";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function redactPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactPayload);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const lower = key.toLowerCase();
    if (typeof nested === "string" && (lower.includes("phone") || lower.includes("e164"))) {
      out[key] = redactPhone(nested);
    } else if (typeof nested === "string" && lower.includes("email")) {
      out[key] = redactEmail(nested);
    } else if (typeof nested === "string" && (lower.includes("token") || lower.includes("pin") || lower.includes("secret"))) {
      out[key] = "***";
    } else if (typeof nested === "string" && lower.includes("payment") && nested.length > 8) {
      out[key] = `…${nested.slice(-6)}`;
    } else {
      out[key] = redactPayload(nested);
    }
  }
  return out;
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(request);
    const { id } = await ctx.params;
    const job = await inspectBackgroundJob(id);
    if (!job) return adminFail(AdminErrorCode.NOT_FOUND, "Job not found.");
    return adminOk({
      ...job,
      payload: redactPayload(job.payload),
      runAfter: job.runAfter.toISOString(),
      lastAttemptAt: job.lastAttemptAt?.toISOString() ?? null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    });
  } catch (err) {
    return adminAuthError(err);
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdmin(request);
    const { id } = await ctx.params;
    const parsed = await readAdminJson(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.value as { action?: string; type?: string };
    if (body.action === "retry") {
      const job = await retryDeadJob(id);
      await recordAdminAudit({
        userId: session.userId,
        action: "JOB_RETRY",
        entityType: "BackgroundJob",
        entityId: id,
        summary: `Retry dead job ${job.type}`,
      });
      return adminOk({ id: job.id, status: job.status, type: job.type });
    }
    if (body.action === "retryType") {
      if (!body.type || !(Object.values(JobType) as string[]).includes(body.type)) {
        return adminFail(AdminErrorCode.VALIDATION_ERROR, "Unknown job type.");
      }
      const count = await retryDeadJobsByType(body.type as (typeof JobType)[keyof typeof JobType]);
      await recordAdminAudit({
        userId: session.userId,
        action: "JOB_RETRY_TYPE",
        entityType: "BackgroundJob",
        entityId: null,
        summary: `Bulk retry ${body.type} (${count})`,
      });
      return adminOk({ count });
    }
    if (body.action === "cancel") {
      const job = await cancelBackgroundJob(id);
      await recordAdminAudit({
        userId: session.userId,
        action: "JOB_CANCEL",
        entityType: "BackgroundJob",
        entityId: id,
        summary: `Cancelled job ${job.type}`,
      });
      return adminOk({ id: job.id, status: job.status });
    }
    return adminFail(AdminErrorCode.VALIDATION_ERROR, "Unknown action.");
  } catch (err) {
    return adminAuthError(err);
  }
}
