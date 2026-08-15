// SPRINT-6: GET /api/internal/kitchen/queue — live orders by status, plus Sprint 5 print health.
import { getKitchenConfig, getPrinterConfig, emitLog } from "@harolds/config";
import { enqueueUnacknowledgedKitchenAlerts, listKitchenQueue, reportPrintQueue } from "@harolds/db";
import { KitchenErrorCode } from "@harolds/types";
import { requireKitchenSession } from "@/lib/kitchen-auth";
import { kitchenAuthError, kitchenFail, kitchenOk } from "@/lib/kitchen-http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    await requireKitchenSession(request);
    const kitchen = getKitchenConfig();
    const printers = getPrinterConfig();
    const [orders, printReport] = await Promise.all([
      listKitchenQueue(),
      reportPrintQueue(printers.serials),
      enqueueUnacknowledgedKitchenAlerts({ thresholdMs: kitchen.unackAlertMs }),
    ]);
    return kitchenOk({
      orders,
      printHealth: {
        counts: printReport.counts,
        oldestQueuedAgeMs: printReport.oldestQueuedAgeMs,
        printers: printReport.printers.map((p) => ({
          serial: p.serial,
          lastPolledAt: p.lastPolledAt?.toISOString() ?? null,
        })),
      },
      pollIntervalMs: kitchen.pollIntervalMs,
      unackScreenMs: kitchen.unackScreenMs,
      unackSoundMs: kitchen.unackSoundMs,
    });
  } catch (err) {
    try {
      return kitchenAuthError(err);
    } catch {
      emitLog("error", "kitchen.queue_failed", { name: err instanceof Error ? err.name : "Error" }, { scope: "kitchen" });
      return kitchenFail(KitchenErrorCode.VALIDATION_ERROR, "Could not load the kitchen queue.");
    }
  }
}
