// SPRINT-7 / SPRINT-18: public API of @harolds/notify — worker, registry, email templates.
export { createJobRegistry, createDefaultJobRegistry, type JobRegistry } from "./registry";
export { runWorkerPass, type WorkerPassResult } from "./worker";
export { JOB_HANDLERS, type JobHandler, type HandlerSuccess } from "./handlers";
export { PermanentJobError, TransientJobError } from "./errors";
export type { NotifyPorts, EmailPort } from "./ports";
export { renderReceiptHtml, renderReceiptText, receiptSubject, type ReceiptEmailInput } from "./templates-email";
export {
  renderPrintFailedAlert,
  renderUnackedAlert,
  renderJobDeadAlert,
  renderPaymentDiscrepancyAlert,
} from "./templates-alerts";
export { formatStoreLocalTime, formatStoreLocalDateTime } from "./time";
