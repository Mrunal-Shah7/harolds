// SPRINT-7 / SPRINT-18: job handlers — one per declared JobType. Never change order state.
//
// SMS was removed in Sprint 18. The two SMS job types remain in the JobType enum because it is
// a PostgreSQL enum with existing rows referencing those values, and dropping them would need a
// migration plus deleting historical job rows. They are handled here as permanent skips so any
// straggler row drains harmlessly instead of crashing the worker on an unhandled type.
import { getJobWorkerConfig } from "@harolds/config";
import {
  countRecentDeliveredAlerts,
  getStoreConfig,
  payloadOf,
  prisma,
  recordJobProviderMessageId,
  type ClaimedBackgroundJob,
} from "@harolds/db";
import type { EmailSendResult } from "@harolds/email";
import { JobType } from "@harolds/types";
import { PermanentJobError, TransientJobError } from "./errors";
import type { NotifyPorts } from "./ports";
import {
  renderJobDeadAlert,
  renderPaymentDiscrepancyAlert,
  renderPrintFailedAlert,
  renderUnackedAlert,
} from "./templates-alerts";
import { receiptSubject, renderReceiptHtml, renderReceiptText, type ReceiptLine } from "./templates-email";

export type HandlerSuccess = {
  result: string;
  providerMessageId?: string;
};

export type JobHandler = (job: ClaimedBackgroundJob, ports: NotifyPorts) => Promise<HandlerSuccess>;

const E164 = /^\+[1-9]\d{7,14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function orderIdOf(job: ClaimedBackgroundJob): string {
  const payload = payloadOf<{ orderId?: string }>(job.payload);
  if (!payload.orderId) {
    throw new PermanentJobError("Job payload is missing orderId.");
  }
  return payload.orderId;
}

async function loadOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { lines: { orderBy: { createdAt: "asc" } } },
  });
  if (!order) {
    throw new PermanentJobError(`Order ${orderId} no longer exists.`);
  }
  return order;
}

function applySendResult(job: ClaimedBackgroundJob, send: EmailSendResult): string {
  if (send.kind === "sent") return send.providerMessageId;
  if (send.kind === "rejected") {
    throw new PermanentJobError(`${send.code}: ${send.message}`);
  }
  throw new TransientJobError(send.message);
}

async function sendAndRecordEmail(
  job: ClaimedBackgroundJob,
  ports: NotifyPorts,
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<string> {
  const send = await ports.sendEmail({ to, subject, html, text });
  if (send.kind === "sent") {
    const existing = job.providerMessageId;
    const combined = existing ? `${existing};email:${send.providerMessageId}` : send.providerMessageId;
    await recordJobProviderMessageId(job.id, combined);
    return send.providerMessageId;
  }
  applySendResult(job, send);
  throw new TransientJobError("unreachable");
}

/**
 * SMS was removed in Sprint 18. These two handlers exist ONLY so that `JOB_HANDLERS` stays
 * exhaustive over the JobType enum, and so that job rows enqueued before the removal drain to a
 * terminal state instead of failing forever as an unhandled type.
 *
 * Nothing enqueues these any more — see `markOrderPaidAndAllocate` and `applyOrderTransition`.
 * If SMS ever returns, restore the real handlers rather than widening these.
 */
const handleRetiredSmsJob: JobHandler = async () => {
  return { result: "SKIPPED_SMS_REMOVED" };
};

export const handleSmsOrderConfirmation: JobHandler = handleRetiredSmsJob;
export const handleSmsOrderReady: JobHandler = handleRetiredSmsJob;

export const handleEmailOrderReceipt: JobHandler = async (job, ports) => {
  if (job.providerMessageId) {
    return { result: "SENT", providerMessageId: job.providerMessageId };
  }
  const order = await loadOrder(orderIdOf(job));
  if (!EMAIL.test(order.customerEmail)) {
    throw new PermanentJobError("Stored email address is not sendable.");
  }
  const store = await getStoreConfig();
  const lines: ReceiptLine[] = order.lines.map((line) => {
    const selected = Array.isArray(line.selectedModifiers) ? line.selectedModifiers : [];
    const modifiers = selected
      .map((m) => {
        if (m && typeof m === "object" && "optionName" in m && typeof m.optionName === "string") {
          return m.optionName;
        }
        return null;
      })
      .filter((n): n is string => Boolean(n));
    return {
      quantity: line.quantity,
      itemName: line.itemName,
      customerNote: line.customerNote,
      modifiers,
      lineTotalCents: line.lineTotalCents,
    };
  });
  const input = {
    storeName: store.storeName,
    addressLine1: store.addressLine1,
    addressLine2: store.addressLine2,
    city: store.city,
    state: store.state,
    postalCode: store.postalCode,
    orderNumber: order.orderNumber ?? "unnumbered",
    estimatedReadyAt: order.estimatedReadyAt,
    timeZone: store.timezone,
    customerNote: order.customerNote,
    customerName: [order.customerFirstName, order.customerLastName].filter(Boolean).join(" ") || null,
    cardLast4: order.cardLast4 ?? null,
    paidAt: order.paidAt ?? null,
    lines,
    subtotalCents: order.subtotalCents,
    taxCents: order.taxCents,
    tipCents: order.tipCents,
    totalCents: order.totalCents,
  };
  const id = await sendAndRecordEmail(
    job,
    ports,
    order.customerEmail,
    receiptSubject(store.storeName, order.orderNumber ?? "unnumbered"),
    renderReceiptHtml(input),
    renderReceiptText(input),
  );
  return { result: "SENT", providerMessageId: id };
};

/** Declared in Sprint 1; v1 customer-ready is SMS only. Handler exists so the type is not unhandled. */
export const handleEmailOrderReady: JobHandler = async () => {
  return { result: "SKIPPED_NOT_IN_V1" };
};

/**
 * SPRINT-18: email is the only manager alert channel now. `StoreConfig.managerAlertPhone` still
 * exists on the row (the SMS removal was deliberately code-only, no migration) but is no longer
 * read — a phone number with no way to send to it is not a destination.
 */
function managerDestinations(store: { managerAlertEmail: string | null }): { email: string | null } {
  const email = store.managerAlertEmail && EMAIL.test(store.managerAlertEmail) ? store.managerAlertEmail : null;
  return { email };
}

async function deliverManagerAlert(
  job: ClaimedBackgroundJob,
  ports: NotifyPorts,
  content: { emailSubject: string; emailText: string },
): Promise<HandlerSuccess> {
  if (job.providerMessageId) {
    return { result: "SENT", providerMessageId: job.providerMessageId };
  }
  const cfg = getJobWorkerConfig();
  const recent = await countRecentDeliveredAlerts({
    type: job.type,
    windowMs: cfg.alertWindowMs,
  });
  if (recent >= cfg.alertMaxPerWindow) {
    return { result: "SKIPPED_VOLUME_CAP" };
  }
  const store = await getStoreConfig();
  const dest = managerDestinations(store);
  if (!dest.email) {
    throw new PermanentJobError("No manager alert email is configured.");
  }

  const html = `<pre style="font-family:Georgia,serif;white-space:pre-wrap">${content.emailText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")}</pre>`;
  const lastId = await sendAndRecordEmail(
    job,
    ports,
    dest.email,
    content.emailSubject,
    html,
    content.emailText,
  );
  return { result: "SENT", providerMessageId: lastId };
}

export const handleAlertPrintFailed: JobHandler = async (job, ports) => {
  const p = payloadOf<{
    orderNumber?: string | null;
    orderId?: string;
    target?: string;
    lastError?: string | null;
    printerSerial?: string | null;
  }>(job.payload);
  if (!p.orderId) throw new PermanentJobError("Print-failed alert payload is missing orderId.");
  return deliverManagerAlert(
    job,
    ports,
    renderPrintFailedAlert({
      orderNumber: p.orderNumber ?? null,
      orderId: p.orderId,
      target: p.target ?? "unknown",
      lastError: p.lastError ?? null,
      printerSerial: p.printerSerial ?? null,
    }),
  );
};

export const handleAlertOrderUnacknowledged: JobHandler = async (job, ports) => {
  const p = payloadOf<{ orderNumber?: string | null; orderId?: string; reason?: string | null }>(job.payload);
  if (!p.orderId) throw new PermanentJobError("Unacknowledged-order alert payload is missing orderId.");
  return deliverManagerAlert(
    job,
    ports,
    renderUnackedAlert({
      orderNumber: p.orderNumber ?? null,
      orderId: p.orderId,
      reason: p.reason ?? null,
    }),
  );
};

export const handleAlertJobDead: JobHandler = async (job, ports) => {
  const p = payloadOf<{
    deadJobId?: string;
    deadJobType?: string;
    orderId?: string | null;
    lastError?: string | null;
    attemptCount?: number | null;
  }>(job.payload);
  if (!p.deadJobId || !p.deadJobType) {
    throw new PermanentJobError("Job-dead alert payload is missing deadJobId or deadJobType.");
  }
  return deliverManagerAlert(
    job,
    ports,
    renderJobDeadAlert({
      deadJobId: p.deadJobId,
      deadJobType: p.deadJobType,
      orderId: p.orderId ?? null,
      lastError: p.lastError ?? null,
      attemptCount: p.attemptCount ?? null,
    }),
  );
};

export const handleAlertPaymentDiscrepancy: JobHandler = async (job, ports) => {
  const p = payloadOf<{
    orderId?: string;
    kind?: string | null;
    processorPaymentId?: string | null;
    orderTotalCents?: number | null;
    gatewayAmountCents?: number | null;
    detail?: string | null;
  }>(job.payload);
  if (!p.orderId) throw new PermanentJobError("Payment-discrepancy alert payload is missing orderId.");
  return deliverManagerAlert(
    job,
    ports,
    renderPaymentDiscrepancyAlert({
      orderId: p.orderId,
      kind: p.kind ?? null,
      processorPaymentId: p.processorPaymentId ?? null,
      orderTotalCents: p.orderTotalCents ?? null,
      gatewayAmountCents: p.gatewayAmountCents ?? null,
      detail: p.detail ?? null,
    }),
  );
};

export const JOB_HANDLERS: Record<JobType, JobHandler> = {
  [JobType.SMS_ORDER_CONFIRMATION]: handleSmsOrderConfirmation,
  [JobType.SMS_ORDER_READY]: handleSmsOrderReady,
  [JobType.EMAIL_ORDER_RECEIPT]: handleEmailOrderReceipt,
  [JobType.EMAIL_ORDER_READY]: handleEmailOrderReady,
  [JobType.ALERT_MANAGER_PRINT_FAILED]: handleAlertPrintFailed,
  [JobType.ALERT_MANAGER_JOB_DEAD]: handleAlertJobDead,
  [JobType.ALERT_MANAGER_ORDER_UNACKNOWLEDGED]: handleAlertOrderUnacknowledged,
  [JobType.ALERT_MANAGER_PAYMENT_DISCREPANCY]: handleAlertPaymentDiscrepancy,
};
