// SPRINT-8: GET /api/internal/admin/jobs — Sprint 7 queue report + recent dead jobs.
import { getJobWorkerConfig } from "@harolds/config";
import { prisma, recordAdminAudit, reportBackgroundJobs, retryDeadJobsByType } from "@harolds/db";
import { AdminErrorCode, JobStatus, JobType } from "@harolds/types";
import { requireAdmin } from "@/lib/admin-auth";
import { adminAuthError, adminFail, adminOk } from "@/lib/admin-http";
import { readAdminJson } from "@/lib/admin-body";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const cfg = getJobWorkerConfig();
    const report = await reportBackgroundJobs({ deadAlertThreshold: cfg.deadAlertThreshold });
    const dead = await prisma.backgroundJob.findMany({
      where: { status: JobStatus.DEAD },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: { id: true, type: true, status: true, attemptCount: true, lastError: true, updatedAt: true, createdAt: true },
    });
    return adminOk({
      ...report,
      recentErrors: report.recentErrors.map((e) => ({ ...e, updatedAt: e.updatedAt.toISOString() })),
      deadJobs: dead.map((j) => ({
        ...j,
        updatedAt: j.updatedAt.toISOString(),
        createdAt: j.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return adminAuthError(err);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdmin(request);
    const parsed = await readAdminJson(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.value as { action?: string; type?: string };
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
    return adminFail(AdminErrorCode.VALIDATION_ERROR, "Unknown action.");
  } catch (err) {
    return adminAuthError(err);
  }
}
