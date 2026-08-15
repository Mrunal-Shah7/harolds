// SPRINT-8: GET /api/internal/admin/reconcile — Sprint 4 script, read-only.
import { redactPaymentId, runReconciliation, todayRange, getStoreConfig } from "@harolds/db";
import { getPayment } from "@harolds/square";
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
    const since = url.searchParams.get("from") ? new Date(url.searchParams.get("from")!) : range.from;
    const until = url.searchParams.get("to") ? new Date(url.searchParams.get("to")!) : range.to;
    const findings = await runReconciliation({
      since,
      until,
      enqueueAlerts: false,
      probePayment: async (paymentId) => {
        const payment = await getPayment(paymentId);
        if (!payment) return null;
        return { status: payment.status, amountCents: payment.amountCents };
      },
    });
    return adminOk({
      since: since.toISOString(),
      until: until.toISOString(),
      readOnly: true,
      findings: findings.map((f) => ({
        ...f,
        processorPaymentId: f.processorPaymentId ? redactPaymentId(f.processorPaymentId) : null,
      })),
    });
  } catch (err) {
    return adminAuthError(err);
  }
}
