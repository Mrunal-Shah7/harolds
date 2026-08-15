// SPRINT-8: GET /api/internal/admin/orders — defaults to today in store time.
import { getStoreConfig, listAdminOrders, todayRange } from "@harolds/db";
import { requireAdmin } from "@/lib/admin-auth";
import { adminAuthError, adminOk } from "@/lib/admin-http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const store = await getStoreConfig();
    const url = new URL(request.url);
    const range = todayRange(store.timezone);
    const from = url.searchParams.get("from") ? new Date(url.searchParams.get("from")!) : range.from;
    const to = url.searchParams.get("to") ? new Date(url.searchParams.get("to")!) : range.to;
    const rows = await listAdminOrders({
      from,
      to,
      status: url.searchParams.get("status") || undefined,
      paymentStatus: url.searchParams.get("paymentStatus") || undefined,
      q: url.searchParams.get("q") || undefined,
    });
    return adminOk({
      timezone: store.timezone,
      from: from.toISOString(),
      to: to.toISOString(),
      orders: rows,
    });
  } catch (err) {
    return adminAuthError(err);
  }
}
