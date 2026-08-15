// SPRINT-8: GET /api/internal/admin/reports/export — CSV of stored-value sales.
import { getStoreConfig, salesReport, salesReportToCsv } from "@harolds/db";
import { requireAdmin } from "@/lib/admin-auth";
import { adminAuthError } from "@/lib/admin-http";
import { NextResponse } from "next/server";

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
    const csv = salesReportToCsv(report);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="harolds-sales-${fromDate}-to-${toDate}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return adminAuthError(err);
  }
}
