// SPRINT-7: public API of @harolds/notify — worker, registry, templates, inbound SMS.
export { createJobRegistry, createDefaultJobRegistry, type JobRegistry } from "./registry";
export { runWorkerPass, type WorkerPassResult } from "./worker";
export { JOB_HANDLERS, type JobHandler, type HandlerSuccess } from "./handlers";
export { PermanentJobError, TransientJobError } from "./errors";
export type { NotifyPorts, SmsPort, EmailPort } from "./ports";
export { processTwilioInbound, classifySmsKeyword } from "./inbound";
export { renderOrderConfirmationSms, renderOrderReadySms, smsContainsMoney } from "./templates-sms";
export { renderReceiptHtml, renderReceiptText, receiptSubject, type ReceiptEmailInput } from "./templates-email";
export {
  renderPrintFailedAlert,
  renderUnackedAlert,
  renderJobDeadAlert,
  renderPaymentDiscrepancyAlert,
} from "./templates-alerts";
export { formatStoreLocalTime, formatStoreLocalDateTime } from "./time";
