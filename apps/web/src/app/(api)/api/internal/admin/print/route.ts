// SPRINT-8: POST /api/internal/admin/print — requeue, cancel, repair via Sprint 5 services.
import {
  cancelQueuedPrintJob,
  recordAdminAudit,
  repairMissingPrintJobs,
  requeuePrintJob,
} from "@harolds/db";
import { getPrinterConfig } from "@harolds/config";
import { AdminErrorCode } from "@harolds/types";
import { requireAdmin } from "@/lib/admin-auth";
import { adminAuthError, adminFail, adminOk } from "@/lib/admin-http";
import { readAdminJson } from "@/lib/admin-body";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    const session = await requireAdmin(request);
    const parsed = await readAdminJson(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.value as { action?: string; jobId?: string; orderId?: string };
    if (body.action === "requeue" && body.jobId) {
      const job = await requeuePrintJob(body.jobId);
      await recordAdminAudit({
        userId: session.userId,
        action: "PRINT_REQUEUE",
        entityType: "PrintJob",
        entityId: job.id,
        summary: `Requeued print job ${job.target}`,
      });
      return adminOk({ id: job.id, status: job.status });
    }
    if (body.action === "cancel" && body.jobId) {
      const job = await cancelQueuedPrintJob(body.jobId);
      await recordAdminAudit({
        userId: session.userId,
        action: "PRINT_CANCEL",
        entityType: "PrintJob",
        entityId: job.id,
        summary: "Cancelled queued print job",
      });
      return adminOk({ id: job.id, status: job.status });
    }
    if (body.action === "repair" && body.orderId) {
      const cfg = getPrinterConfig();
      const jobs = await repairMissingPrintJobs({
        orderId: body.orderId,
        kitchenSerial: cfg.kitchenSerial,
        counterSerial: cfg.counterSerial,
        maxAttempts: cfg.maxAttempts,
      });
      await recordAdminAudit({
        userId: session.userId,
        action: "PRINT_REPAIR",
        entityType: "Order",
        entityId: body.orderId,
        summary: `Repair created ${jobs.length} print job(s)`,
      });
      return adminOk(jobs.map((j) => ({ id: j.id, target: j.target, status: j.status })));
    }
    return adminFail(AdminErrorCode.VALIDATION_ERROR, "Unknown print action.");
  } catch (err) {
    return adminAuthError(err);
  }
}
