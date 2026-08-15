// SPRINT-5: operational print controls — reprint, requeue, cancel, repair, queue report (no UI)
import { getPrinterConfig } from "@harolds/config";
import {
  cancelQueuedPrintJob,
  repairMissingPrintJobs,
  reportPrintQueue,
  reprintTicket,
  requeuePrintJob,
} from "@harolds/db";
import { PrintTarget } from "@harolds/types";

export async function reprintOrderTicket(orderId: string, target: PrintTarget) {
  return reprintTicket(orderId, target);
}

export async function requeueJob(jobId: string) {
  return requeuePrintJob(jobId);
}

export async function cancelQueuedJob(jobId: string) {
  return cancelQueuedPrintJob(jobId);
}

export async function repairOrderPrintJobs(orderId: string) {
  const cfg = getPrinterConfig();
  return repairMissingPrintJobs({
    orderId,
    kitchenSerial: cfg.kitchenSerial,
    counterSerial: cfg.counterSerial,
    maxAttempts: cfg.maxAttempts,
  });
}

export async function getPrintQueueReport() {
  const cfg = getPrinterConfig();
  return reportPrintQueue(cfg.serials);
}

export { PrintTarget };
