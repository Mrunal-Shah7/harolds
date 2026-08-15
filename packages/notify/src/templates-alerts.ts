// SPRINT-7: manager alert copy — what is wrong, which order, what to do.
export type PrintFailedAlert = {
  orderNumber: string | null;
  orderId: string;
  target: string;
  lastError: string | null;
  printerSerial: string | null;
};

export type UnackedAlert = {
  orderNumber: string | null;
  orderId: string;
  reason: string | null;
};

export type JobDeadAlert = {
  deadJobId: string;
  deadJobType: string;
  orderId: string | null;
  lastError: string | null;
  attemptCount: number | null;
};

export type PaymentDiscrepancyAlert = {
  orderId: string;
  kind: string | null;
  processorPaymentId: string | null;
  orderTotalCents: number | null;
  squareAmountCents: number | null;
  detail: string | null;
};

function orderLabel(orderNumber: string | null, orderId: string): string {
  return orderNumber ? `order ${orderNumber}` : `order id ${orderId}`;
}

export function renderPrintFailedAlert(a: PrintFailedAlert): { sms: string; emailSubject: string; emailText: string } {
  const who = orderLabel(a.orderNumber, a.orderId);
  const err = a.lastError ?? "no error recorded";
  const sms = `Print failed for ${who} (${a.target} on ${a.printerSerial ?? "unknown printer"}): ${err}. Check the printer and reprint from the queue.`;
  return {
    sms,
    emailSubject: `Print failed — ${who}`,
    emailText: [
      sms,
      "",
      `Order id: ${a.orderId}`,
      `Ticket: ${a.target}`,
      `Printer: ${a.printerSerial ?? "unknown"}`,
      `Last error: ${err}`,
      "Action: confirm the TM-m30III is on, paper is loaded, and reprint the ticket. Do not ignore this during a rush.",
    ].join("\n"),
  };
}

export function renderUnackedAlert(a: UnackedAlert): { sms: string; emailSubject: string; emailText: string } {
  const who = orderLabel(a.orderNumber, a.orderId);
  const reason = a.reason ?? "Paid order has not been acknowledged by the kitchen.";
  const sms = `${who} is still unacknowledged. ${reason} Open the kitchen display and start the order.`;
  return {
    sms,
    emailSubject: `Unacknowledged ${who}`,
    emailText: [
      sms,
      "",
      `Order id: ${a.orderId}`,
      `Reason: ${reason}`,
      "Action: on the kitchen display, move this order to In progress. If the board is down, cook from the printed ticket and mark it when the board is back.",
    ].join("\n"),
  };
}

export function renderJobDeadAlert(a: JobDeadAlert): { sms: string; emailSubject: string; emailText: string } {
  const who = a.orderId ? ` (order id ${a.orderId})` : "";
  const sms = `Background job ${a.deadJobType} is dead${who}. Last error: ${a.lastError ?? "none"}. Inspect the job queue and retry or cancel.`;
  return {
    sms,
    emailSubject: `Dead job — ${a.deadJobType}`,
    emailText: [
      sms,
      "",
      `Dead job id: ${a.deadJobId}`,
      `Type: ${a.deadJobType}`,
      `Attempts: ${a.attemptCount ?? "unknown"}`,
      `Last error: ${a.lastError ?? "none"}`,
      "Action: this message never reached its recipient. Use retry-dead-job after fixing the cause (credentials, destination, provider). Do not leave it in DEAD.",
    ].join("\n"),
  };
}

export function renderPaymentDiscrepancyAlert(
  a: PaymentDiscrepancyAlert,
): { sms: string; emailSubject: string; emailText: string } {
  const sms = `Payment discrepancy for order id ${a.orderId} (${a.kind ?? "unknown"}). Do not auto-fix money. Reconcile Square vs the order.`;
  return {
    sms,
    emailSubject: `Payment discrepancy — ${a.orderId}`,
    emailText: [
      sms,
      "",
      `Order id: ${a.orderId}`,
      `Kind: ${a.kind ?? "unknown"}`,
      `Square payment: ${a.processorPaymentId ?? "none"}`,
      `Order total cents: ${a.orderTotalCents ?? "n/a"}`,
      `Square amount cents: ${a.squareAmountCents ?? "n/a"}`,
      `Detail: ${a.detail ?? "none"}`,
      "Action: compare Square and the order row. Do not mark the order paid from this alert. Run reconciliation and resolve by hand.",
    ].join("\n"),
  };
}
