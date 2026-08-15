// SPRINT-8: GET /api/internal/admin/reports — stored-value sales report.
import { getStoreConfig, salesReport } from "@harolds/db";
import { requireAdmin } from "@/lib/admin-auth";
import { adminAuthError, adminOk } from "@/lib/admin-http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const store = await getStoreConfig();
    const url = new URL(request.url);
    const fromDate = url.searchParams.get("from") ?? new Date().toISOString().slice(0, 10);
    const toDate = url.searchParams.get("to") ?? fromDate;
    const report = await salesReport({ fromDate, toDate, timeZone: store.timezone });
    return adminOk(report);
  } catch (err) {
    return adminAuthError(err);
  }
}
