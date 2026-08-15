// SPRINT-8: GET /api/internal/admin/dashboard — printer, jobs, today, store state.
import { getJobWorkerConfig, getKitchenConfig, getPrinterConfig } from "@harolds/config";
import { getOperationsSnapshot, getStoreConfig } from "@harolds/db";
import { requireAdmin } from "@/lib/admin-auth";
import { adminAuthError, adminOk } from "@/lib/admin-http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const store = await getStoreConfig();
    const printers = getPrinterConfig();
    const jobs = getJobWorkerConfig();
    const kitchen = getKitchenConfig();
    const snapshot = await getOperationsSnapshot({
      printerSerials: printers.serials,
      deadAlertThreshold: jobs.deadAlertThreshold,
      unackAlertMs: kitchen.unackAlertMs,
      timeZone: store.timezone,
    });
    return adminOk(snapshot);
  } catch (err) {
    return adminAuthError(err);
  }
}
