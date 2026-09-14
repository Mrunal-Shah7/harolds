// SPRINT-4 / SPRINT-17: NMI gateway client — the ONLY module in this repo that speaks to the
// payment gateway. All callers go through the functions exported here, and nothing about NMI's
// wire format (form-encoded requests, XML query responses, numeric response codes) escapes it.
import { env, getNmiConfig } from "@harolds/config";

import { classifyNmiResult, classifyTransportError, NmiResponse, PaymentClientError } from "./errors";
import {
  logPaymentAttempt,
  logPaymentOutcome,
  logRefundAttempt,
  logRefundOutcome,
  logTransportFailure,
  logWebhookVerification,
} from "./logger";
import { fromGatewayAmount, MoneyError, toGatewayAmount } from "./money";
import type {
  CreatePaymentInput,
  NormalizedPayment,
  NormalizedRefund,
  PaymentEnvironmentName,
  PaymentOutcome,
  RefundOutcome,
  RefundPaymentInput,
  VerifyWebhookSignatureInput,
} from "./types";

/**
 * Gateway calls are bounded so a hung socket cannot pin a checkout request open indefinitely.
 *
 * Exported because callers need it to reason about how long a charge can still be IN FLIGHT.
 * A sale that has not yet been booked at the gateway is indistinguishable from one that never
 * arrived, so the recovery path must not start guessing until this window has elapsed.
 */
export const GATEWAY_REQUEST_TIMEOUT_MS = 20_000;
const REQUEST_TIMEOUT_MS = GATEWAY_REQUEST_TIMEOUT_MS;

/**
 * NOTE ON DOUBLE CHARGES. NMI has no per-request idempotency key — there is no equivalent of
 * Square's `idempotencyKey`, and `dup_seconds` (the gateway's duplicate-window override) is
 * rejected outright by this account's processor: sending it fails EVERY sale with
 * "Overriding Duplicate Threshold is not allowed for this processor". It is therefore not
 * sent, and there is no gateway-side protection to fall back on.
 *
 * The ONLY defence against a double charge is the caller's pre-charge guard, which claims the
 * order row before this module is ever entered — see `claimOrderForCharge` in checkout.ts.
 * Do not weaken it on the assumption that the gateway will catch a repeat.
 */

/** The active gateway environment, for startup logging / health checks. Never throws. */
export function getPaymentEnvironment(): PaymentEnvironmentName {
  return env.NMI_ENVIRONMENT;
}

/**
 * NMI answers every outcome — approval, decline, and our own malformed requests — with
 * HTTP 200 and a form-encoded body. A non-200 therefore means the request never reached
 * transaction processing at all, and is treated as indeterminate rather than as a decline.
 */
async function postToGateway(
  endpoint: "transact" | "query",
  params: Record<string, string>,
): Promise<URLSearchParams | string> {
  // Credentials are resolved BEFORE the try-blocks that wrap the call sites, and a failure
  // here is re-thrown as a PaymentClientError rather than left as a plain Error. Callers
  // classify an unrecognised throw as `transport_failure`, which means "the charge may have
  // landed" — exactly the wrong thing to say about a request that was never sent because the
  // security key is missing. That misreport sends the customer an "we couldn't confirm" page
  // and leaves an order stuck pending reconciliation, for what is a config typo.
  let config;
  try {
    config = getNmiConfig();
  } catch (err) {
    throw new PaymentClientError(
      err instanceof Error ? err.message : "Payment gateway credentials are not configured.",
      "auth",
    );
  }

  const body = new URLSearchParams({ ...params, security_key: config.securityKey });

  const response = await fetch(`${config.baseUrl}/${endpoint}.php`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new GatewayTransportError(`Gateway returned HTTP ${response.status}.`);
  }

  const text = await response.text();
  return endpoint === "query" ? text : new URLSearchParams(text);
}

/** Internal marker for "the call did not complete" — never leaves this module. */
class GatewayTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GatewayTransportError";
  }
}

function readResult(body: URLSearchParams): {
  response: string;
  responseCode: string;
  responseText: string;
  transactionId: string;
} {
  return {
    response: body.get("response") ?? "",
    responseCode: body.get("response_code") ?? "",
    responseText: body.get("responsetext") ?? "",
    transactionId: body.get("transactionid") ?? "",
  };
}

/**
 * NMI returns the card as a masked PAN (e.g. `4xxxxxxxxxxx1111`). Only the trailing four
 * digits are ever extracted, and only when they are unambiguously the last four.
 */
function extractCardLast4(masked: string | null | undefined): string | null {
  if (!masked) return null;
  const last4 = masked.trim().slice(-4);
  return /^\d{4}$/.test(last4) ? last4 : null;
}


/**
 * Parse a gateway amount, converting a `MoneyError` into this package's own taxonomy.
 *
 * The raw parse throws outside the try-blocks that wrap the HTTP call, so an unparseable or
 * absent action amount would otherwise escape as an unclassified error and bypass every caller
 * that handles `PaymentClientError`.
 */
function parseAmountOrThrow(amount: string | null, context: string): number {
  try {
    return fromGatewayAmount(amount);
  } catch (err) {
    if (err instanceof MoneyError) {
      throw new PaymentClientError(`${context}: ${err.message}`, "unexpected");
    }
    throw err;
  }
}

export async function createPayment(input: CreatePaymentInput): Promise<PaymentOutcome> {
  logPaymentAttempt({
    orderId: input.orderId,
    correlationId: input.correlationId,
    amountCents: input.amountCents,
    tokenProvided: Boolean(input.paymentToken),
  });

  // Amount validation happens before the call so a malformed total can never be sent.
  const amount = toGatewayAmount(input.amountCents);

  let outcome: PaymentOutcome;
  try {
    const body = (await postToGateway("transact", {
      type: "sale",
      payment_token: input.paymentToken,
      amount,
      orderid: input.orderId,
      order_description: `Order ${input.orderReference}`,
      currency: "USD",
    })) as URLSearchParams;

    const result = readResult(body);

    if (result.response === NmiResponse.APPROVED) {
      if (!result.transactionId) {
        throw new PaymentClientError("Gateway approved the sale but returned no transaction id.");
      }
      outcome = {
        kind: "succeeded",
        paymentId: result.transactionId,
        // Trust the amount WE sent, not an echo: the gateway omits `amount` on some
        // approvals, and a missing echo must not be read as a different charge.
        amountCents: input.amountCents,
        status: "completed",
        rawStatus: result.responseCode,
        cardLast4: extractCardLast4(body.get("cc_number")),
      };
    } else {
      const classification = classifyNmiResult(result, "payment");
      if (classification.outcome === "client_error") {
        throw classification.error;
      }
      outcome =
        classification.outcome === "declined_payment"
          ? {
              kind: "declined",
              // A decline can still carry a transaction id; keep it so the failure is traceable.
              paymentId: result.transactionId || null,
              reason: classification.reason,
              code: classification.code,
            }
          : {
              kind: "transport_failure",
              message: classification.message,
              paymentId: result.transactionId || null,
            };
    }
  } catch (err) {
    if (err instanceof PaymentClientError) throw err;
    const classification = classifyTransportError(err);
    outcome = { kind: "transport_failure", message: classification.message, paymentId: null };
  }

  if (outcome.kind === "transport_failure") {
    logTransportFailure({ operation: "createPayment", message: outcome.message, paymentId: outcome.paymentId });
  }
  logPaymentOutcome({
    orderId: input.orderId,
    correlationId: input.correlationId,
    amountCents: input.amountCents,
    outcomeKind: outcome.kind,
    paymentId: outcome.paymentId,
  });
  return outcome;
}

export async function getPayment(paymentId: string): Promise<NormalizedPayment | null> {
  let xml: string;
  try {
    xml = (await postToGateway("query", { transaction_id: paymentId })) as string;
  } catch (err) {
    // A config/credential failure is NOT a transport failure — never relabel it as one.
    if (err instanceof PaymentClientError) throw err;
    const classification = classifyTransportError(err);
    logTransportFailure({ operation: "getPayment", message: classification.message, paymentId });
    throw new PaymentClientError(classification.message, "unexpected");
  }

  const transaction = selectTransaction(xml, paymentId);
  if (!transaction) return null;

  const condition = (xmlField(transaction, "condition") ?? "").toLowerCase();
  // The ORIGINAL charge, not the latest action. A sale accumulates further actions over its
  // life (settle, void), and reading the last one would report a void's amount as the amount
  // charged — which the webhook path compares against the order total to detect tampering.
  const charge = findAction(transaction, ["sale", "auth", "capture"]);

  return {
    paymentId: xmlField(transaction, "transaction_id") ?? paymentId,
    status: normaliseCondition(condition),
    amountCents: parseAmountOrThrow(actionField(charge, "amount"), "getPayment"),
    orderId: xmlField(transaction, "order_id") ?? null,
    referenceId: xmlField(transaction, "order_id") ?? null,
    createdAt: parseGatewayDate(actionField(charge, "date")),
    cardLast4: extractCardLast4(xmlField(transaction, "cc_number")),
  };
}

/**
 * Find the sale booked against one of OUR order ids, if any.
 *
 * This is the authoritative answer to "did this order ever get charged?", and it is what makes
 * recovery safe in the absence of a gateway idempotency key: when a charge attempt is
 * interrupted before its outcome is persisted, asking by `order_id` tells us whether the money
 * moved, instead of guessing. Returns null when the gateway has no record of the order.
 *
 * Reversals are booked against the same `order_id`, so the SALE action is selected explicitly
 * rather than taking whichever transaction the gateway lists first.
 */
export async function findPaymentByOrderId(orderId: string): Promise<NormalizedPayment | null> {
  let xml: string;
  try {
    xml = (await postToGateway("query", { order_id: orderId })) as string;
  } catch (err) {
    if (err instanceof PaymentClientError) throw err;
    const classification = classifyTransportError(err);
    logTransportFailure({ operation: "findPaymentByOrderId", message: classification.message });
    throw new PaymentClientError(classification.message, "unexpected");
  }

  const blocks = transactionBlocks(xml);
  const sale = blocks.find((block) => {
    const action = findAction(block, ["sale", "auth", "capture"]);
    const type = actionField(action, "action_type")?.toLowerCase();
    return type === "sale" || type === "auth" || type === "capture";
  });
  if (!sale) return null;

  const transactionId = xmlField(sale, "transaction_id");
  if (!transactionId) return null;

  const condition = (xmlField(sale, "condition") ?? "").toLowerCase();
  const charge = findAction(sale, ["sale", "auth", "capture"]);
  return {
    paymentId: transactionId,
    status: normaliseCondition(condition),
    amountCents: parseAmountOrThrow(actionField(charge, "amount"), "findPaymentByOrderId"),
    orderId: xmlField(sale, "order_id") ?? null,
    referenceId: xmlField(sale, "order_id") ?? null,
    createdAt: parseGatewayDate(actionField(charge, "date")),
    cardLast4: extractCardLast4(xmlField(sale, "cc_number")),
  };
}

export async function refundPayment(input: RefundPaymentInput): Promise<RefundOutcome> {
  logRefundAttempt({
    paymentId: input.paymentId,
    correlationId: input.correlationId,
    amountCents: input.amountCents,
  });

  const amount = toGatewayAmount(input.amountCents);

  let outcome: RefundOutcome;
  try {
    // `type=refund` is the default for BOTH settled and unsettled sales. NMI documents void as
    // the reversal for unsettled transactions, but this gateway accepts a refund against a
    // `pendingsettlement` sale too (verified against the sandbox), and refund is the safer
    // default: it takes an explicit amount, so it supports partial reversals, whereas a void
    // always reverses the whole authorisation. Callers wanting that whole-authorisation
    // cancellation opt in with `void: true`.
    const useVoid = input.void === true;

    const params: Record<string, string> = useVoid
      ? { type: "void", transactionid: input.paymentId }
      : { type: "refund", transactionid: input.paymentId, amount };

    const body = (await postToGateway("transact", params)) as URLSearchParams;
    const result = readResult(body);

    if (result.response === NmiResponse.APPROVED) {
      if (!result.transactionId) {
        throw new PaymentClientError("Gateway approved the reversal but returned no transaction id.");
      }
      outcome = {
        kind: "succeeded",
        refundId: result.transactionId,
        // A void always reverses the full authorisation; a refund reverses what we asked for.
        amountCents: input.amountCents,
        status: useVoid ? "voided" : "completed",
      };
    } else {
      const classification = classifyNmiResult(result, "refund");
      if (classification.outcome === "client_error") {
        throw classification.error;
      }
      outcome =
        classification.outcome === "declined_refund"
          ? { kind: "declined", reason: classification.reason, code: classification.code }
          : { kind: "transport_failure", message: classification.message, refundId: null };
    }
  } catch (err) {
    if (err instanceof PaymentClientError) throw err;
    const classification = classifyTransportError(err);
    outcome = { kind: "transport_failure", message: classification.message, refundId: null };
  }

  if (outcome.kind === "transport_failure") {
    logTransportFailure({ operation: "refundPayment", message: outcome.message, refundId: outcome.refundId });
  }
  logRefundOutcome({
    paymentId: input.paymentId,
    correlationId: input.correlationId,
    amountCents: input.amountCents,
    outcomeKind: outcome.kind,
    refundId: outcome.kind === "succeeded" ? outcome.refundId : null,
  });
  return outcome;
}

export async function getRefund(refundId: string): Promise<NormalizedRefund | null> {
  let xml: string;
  try {
    xml = (await postToGateway("query", { transaction_id: refundId })) as string;
  } catch (err) {
    // A config/credential failure is NOT a transport failure — never relabel it as one.
    if (err instanceof PaymentClientError) throw err;
    const classification = classifyTransportError(err);
    logTransportFailure({ operation: "getRefund", message: classification.message, refundId });
    throw new PaymentClientError(classification.message, "unexpected");
  }

  const transaction = selectTransaction(xml, refundId);
  if (!transaction) return null;

  const reversal = findAction(transaction, ["refund", "void", "credit"]);
  return {
    refundId: xmlField(transaction, "transaction_id") ?? refundId,
    // A refund/void is booked as its own transaction that names the sale it reverses.
    paymentId: xmlField(transaction, "original_transaction_id") ?? null,
    status: normaliseCondition((xmlField(transaction, "condition") ?? "").toLowerCase()),
    // Reported negative by the gateway; fromGatewayAmount returns the magnitude.
    amountCents: parseAmountOrThrow(actionField(reversal, "amount"), "getRefund"),
    createdAt: parseGatewayDate(actionField(reversal, "date")),
  };
}

/**
 * Verify an NMI webhook signature over the RAW request body.
 *
 * NMI signs `<timestamp>.<raw body>` with HMAC-SHA256 under the account's webhook signing
 * key and sends `webhook-signature: t=<timestamp>,s=<hex digest>`. The body must be the
 * exact bytes received — re-serialising the parsed JSON changes the digest.
 */
export async function verifyWebhookSignature(input: VerifyWebhookSignatureInput): Promise<boolean> {
  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const config = getNmiConfig();
  const rawBody = typeof input.body === "string" ? input.body : input.body.toString("utf8");

  const parts = new Map<string, string>();
  for (const segment of input.signatureHeader.split(",")) {
    const [key, ...rest] = segment.trim().split("=");
    if (key && rest.length > 0) parts.set(key, rest.join("="));
  }

  const timestamp = parts.get("t");
  const provided = parts.get("s");
  let isValid = false;

  if (timestamp && provided) {
    const expected = createHmac("sha256", config.webhookSigningKey)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");
    const expectedBuf = Buffer.from(expected, "utf8");
    const providedBuf = Buffer.from(provided, "utf8");
    // Compare in constant time, and only when lengths match — timingSafeEqual throws otherwise.
    isValid = expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);
  }

  logWebhookVerification({ valid: isValid });
  return isValid;
}

// ─── query.php XML ───────────────────────────────────────────────────────────
// query.php is the one NMI endpoint that answers in XML rather than form encoding. The
// response is a fixed, shallow, attribute-free document, so a narrow field reader is used
// instead of pulling in an XML parser dependency for four fields.

/**
 * Select the transaction block for `id`.
 *
 * A query by a sale's id returns that sale AND every reversal booked against it, each as its
 * own `<transaction>` with its own id (verified against the sandbox). Taking the first block
 * blindly would therefore read a refund's row — and its negative amount and separate
 * condition — as if it were the sale. Match on the id we asked for; fall back to the first
 * block only when the document carries exactly one.
 */
function selectTransaction(xml: string, id: string): string | null {
  const blocks = transactionBlocks(xml);
  if (blocks.length === 0) return null;
  const match = blocks.find((block) => xmlField(block, "transaction_id") === id);
  if (match) return match;
  return blocks.length === 1 ? (blocks[0] ?? null) : null;
}

/** Every `<transaction>` body in the document, tags stripped. */
function transactionBlocks(xml: string): string[] {
  const blocks = xml.match(/<transaction>[\s\S]*?<\/transaction>/g);
  if (!blocks) return [];
  return blocks.map((block) =>
    block.replace(/^<transaction>/, "").replace(/<\/transaction>$/, ""),
  );
}

function xmlField(fragment: string, field: string): string | null {
  // Only the transaction's OWN fields — a leading `<action>` block would otherwise shadow them.
  const withoutActions = fragment.replace(/<action>[\s\S]*?<\/action>/g, "");
  const match = new RegExp(`<${field}>([\\s\\S]*?)</${field}>`).exec(withoutActions);
  if (!match?.[1]) return null;
  const value = decodeXmlEntities(match[1].trim());
  return value.length > 0 ? value : null;
}

/**
 * The first `<action>` whose `action_type` is one of `types`.
 *
 * A transaction accumulates one action per operation over its life, so "which action" has to
 * be asked by KIND rather than by position: the charge is the sale/auth action even after a
 * settle or void has been appended after it. Falls back to the first action when the gateway
 * reports no recognisable type, and to null when there are no actions at all.
 */
function findAction(fragment: string, types: string[]): string | null {
  const actions = fragment.match(/<action>[\s\S]*?<\/action>/g);
  if (!actions || actions.length === 0) return null;
  for (const action of actions) {
    const match = /<action_type>([\s\S]*?)<\/action_type>/.exec(action);
    const type = match?.[1] ? decodeXmlEntities(match[1].trim()).toLowerCase() : "";
    if (types.includes(type)) return action;
  }
  return actions[0] ?? null;
}

function actionField(action: string | null, field: string): string | null {
  if (!action) return null;
  const match = new RegExp(`<${field}>([\\s\\S]*?)</${field}>`).exec(action);
  const value = match?.[1] ? decodeXmlEntities(match[1].trim()) : "";
  return value.length > 0 ? value : null;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** NMI reports action dates as `YYYYMMDDHHMMSS` in the account's timezone. */
function parseGatewayDate(raw: string | null): string | null {
  if (!raw) return null;
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
}

/**
 * Collapse NMI's `condition` vocabulary into the status words the rest of the system already
 * understands, so webhook/reconcile callers keep comparing against "completed"/"failed".
 */
function normaliseCondition(condition: string): string {
  switch (condition) {
    case "complete":
    case "pendingsettlement":
      return "completed";
    case "failed":
      return "failed";
    case "canceled":
    case "cancelled":
      return "canceled";
    case "pending":
    case "in_progress":
      return "pending";
    case "abandoned":
      return "abandoned";
    default:
      return condition || "unknown";
  }
}
