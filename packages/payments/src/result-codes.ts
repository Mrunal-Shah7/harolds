// SPRINT-18.3: how a SALE's gateway answer is read — the Merchant Pay Connect Result Code Table,
// turned into what happened (internal reason), what kind of thing it is (classification), what
// the checkout does about it (handling), and what the customer reads (customer message).
//
// SOURCE: docs/Merchant Pay Connect INC-Direct-Post-API.md — "Result Code Table" (Payment API),
// plus response_code 301 from its "Rate Limits" section, which the table itself omits. The
// descriptions below are the table's own words. Do not extend this from memory or from generic
// NMI documentation: this MID is a Merchant Pay Connect account, and their table is the one that
// applies. Refunds are classified separately (errors.ts) and are not changed by this table.
import { PaymentDeclineCode, type PaymentAttemptClassification } from "./types";

/**
 * What the checkout does with an answer. Kept separate from `classification` on purpose: a
 * communication failure is an incident AND may have charged, and the charge-safety rule (never
 * release a claim that may have money behind it) is decided by `handling`, not by blame.
 */
export type SaleHandling =
  /** The sale went through. */
  | "approved"
  /** The card was declined. Definite: no money moved. HTTP 402. */
  | "decline"
  /** Our side / the gateway failed and the sale was definitely NOT processed. HTTP 503. */
  | "incident"
  /** No reliable answer — the charge MAY exist. Reconcile before any retry. HTTP 502. */
  | "ambiguous";

/**
 * Customer-facing sentences. These are the ONLY words a customer ever reads about a card
 * outcome, and they never name a fraud disposition: pick-up, lost, stolen and fraudulent cards
 * read exactly like an ordinary decline. Internal reasons live in a different vocabulary and
 * never reach a customer.
 */
export const CustomerMessage = {
  DECLINED: "Your card was declined. Please try a different card, or contact your bank.",
  CALL_ISSUER:
    "Your bank declined this payment and asked you to contact them. Please call the number on the back of your card, or use a different card.",
  INSUFFICIENT_FUNDS: "Your card was declined for insufficient funds. Please use a different card.",
  OVER_LIMIT: "This payment is over a limit on your card. Please use a different card.",
  CHECK_CARD_DETAILS:
    "Some of the card details didn't match. Please check the card number, expiry date and security code, and try again.",
  EXPIRED_CARD: "This card has expired. Please use a different card.",
  CHECK_EXPIRY: "The expiry date doesn't match this card. Please check it and try again.",
  CHECK_SECURITY_CODE:
    "The security code doesn't match this card. Please check the 3- or 4-digit code and try again.",
  UPDATED_CARD:
    "Your bank has issued updated details for this card. Please use your current card, or a different one.",
  UNSUPPORTED_CARD_TYPE: "We can't accept this type of card. Please use a different card.",
  REENTER_CARD: "Please re-enter your card details and try again.",
  /** Incidents. Deliberately says nothing about the card: nothing is wrong with it. */
  PAYMENTS_UNAVAILABLE:
    "Online payments are temporarily unavailable, and nothing was charged. Please try again in a few minutes, or call the store to place your order.",
  /** Ambiguous outcomes. The checkout replaces this with its own reconciliation wording. */
  COULD_NOT_CONFIRM: "We couldn't confirm that payment.",
} as const;
export type CustomerMessageKey = keyof typeof CustomerMessage;

export type ResultCodeEntry = {
  /** Verbatim from the Merchant Pay Connect Result Code Table. */
  description: string;
  internalReason: string;
  classification: PaymentAttemptClassification;
  handling: SaleHandling;
  customerMessage: CustomerMessageKey;
  /** Public decline category returned in `details.declineCode`. Declines only. */
  declineCode?: PaymentDeclineCode;
};

const decline = (
  description: string,
  internalReason: string,
  customerMessage: CustomerMessageKey,
  declineCode: PaymentDeclineCode,
): ResultCodeEntry => ({
  description,
  internalReason,
  classification: "DECLINED",
  handling: "decline",
  customerMessage,
  declineCode,
});

const failure = (
  description: string,
  internalReason: string,
  classification: Exclude<PaymentAttemptClassification, "APPROVED" | "DECLINED">,
  handling: "incident" | "ambiguous",
): ResultCodeEntry => ({
  description,
  internalReason,
  classification,
  handling,
  customerMessage: handling === "incident" ? "PAYMENTS_UNAVAILABLE" : "COULD_NOT_CONFIRM",
});

const D = PaymentDeclineCode;

/**
 * Every code in the Result Code Table, plus 301. A test iterates this and the table's code list
 * so a code can be neither missing nor invented.
 */
export const RESULT_CODE_TABLE: Readonly<Record<string, ResultCodeEntry>> = {
  "100": {
    description: "Transaction was approved.",
    internalReason: "APPROVED",
    classification: "APPROVED",
    handling: "approved",
    customerMessage: "DECLINED", // unused on approval
  },

  // ── 2xx: declines. Statements about the CARD. ──────────────────────────────────────────
  "200": decline("Transaction was declined by processor.", "DECLINED_BY_PROCESSOR", "DECLINED", D.CARD_DECLINED),
  "201": decline("Do not honor.", "DO_NOT_HONOR", "DECLINED", D.CARD_DECLINED),
  "202": decline("Insufficient funds.", "INSUFFICIENT_FUNDS", "INSUFFICIENT_FUNDS", D.INSUFFICIENT_FUNDS),
  "203": decline("Over limit.", "OVER_LIMIT", "OVER_LIMIT", D.TRANSACTION_LIMIT_EXCEEDED),
  "204": decline("Transaction not allowed.", "TRANSACTION_NOT_ALLOWED", "DECLINED", D.CARD_DECLINED),
  "220": decline("Incorrect payment information.", "INCORRECT_PAYMENT_INFORMATION", "CHECK_CARD_DETAILS", D.INVALID_CARD),
  "221": decline("No such card issuer.", "NO_SUCH_CARD_ISSUER", "CHECK_CARD_DETAILS", D.INVALID_CARD),
  "222": decline("No card number on file with issuer.", "NO_CARD_NUMBER_ON_FILE", "CHECK_CARD_DETAILS", D.INVALID_CARD),
  "223": decline("Expired card.", "EXPIRED_CARD", "EXPIRED_CARD", D.CARD_EXPIRED),
  "224": decline("Invalid expiration date.", "INVALID_EXPIRATION_DATE", "CHECK_EXPIRY", D.INVALID_CARD),
  "225": decline("Invalid card security code.", "INVALID_SECURITY_CODE", "CHECK_SECURITY_CODE", D.CVV_FAILURE),
  "226": decline("Invalid PIN.", "INVALID_PIN", "DECLINED", D.CARD_DECLINED),
  "240": decline("Call issuer for further information.", "CALL_ISSUER", "CALL_ISSUER", D.CALL_ISSUER),
  // Fraud family: distinct internal reasons, but the SAME customer message and public category
  // as a generic decline. A customer at a counter is never told their card was reported stolen.
  "250": decline("Pick up card.", "PICK_UP_CARD", "DECLINED", D.CARD_DECLINED),
  "251": decline("Lost card.", "LOST_CARD", "DECLINED", D.CARD_DECLINED),
  "252": decline("Stolen card.", "STOLEN_CARD", "DECLINED", D.CARD_DECLINED),
  "253": decline("Fraudulent card.", "FRAUDULENT_CARD", "DECLINED", D.CARD_DECLINED),
  "260": decline(
    "Declined with further instructions available. (See response text)",
    "DECLINED_WITH_INSTRUCTIONS",
    "DECLINED",
    D.CARD_DECLINED,
  ),
  "261": decline("Declined-Stop all recurring payments.", "STOP_ALL_RECURRING", "DECLINED", D.CARD_DECLINED),
  "262": decline("Declined-Stop this recurring program.", "STOP_THIS_RECURRING", "DECLINED", D.CARD_DECLINED),
  "263": decline(
    "Declined-Update cardholder data available.",
    "UPDATE_CARDHOLDER_DATA_AVAILABLE",
    "UPDATED_CARD",
    D.VERIFICATION_REQUIRED,
  ),
  "264": decline("Declined-Retry in a few days.", "RETRY_IN_A_FEW_DAYS", "DECLINED", D.CARD_DECLINED),

  // ── 3xx / 4xx: NOT declines. Statements about us, the gateway, or the network. ─────────
  "300": failure("Transaction was rejected by gateway.", "REJECTED_BY_GATEWAY", "GATEWAY_FAILURE", "incident"),
  // From the "Rate Limits" section, not the Result Code Table.
  "301": failure("Rate limit exceeded.", "RATE_LIMITED", "GATEWAY_FAILURE", "incident"),
  "400": failure("Transaction error returned by processor.", "PROCESSOR_ERROR", "GATEWAY_FAILURE", "incident"),
  "410": failure("Invalid merchant configuration.", "INVALID_MERCHANT_CONFIGURATION", "CONFIGURATION_FAILURE", "incident"),
  "411": failure("Merchant account is inactive.", "MERCHANT_ACCOUNT_INACTIVE", "CONFIGURATION_FAILURE", "incident"),
  // Communication and duplicate codes stay AMBIGUOUS: the processor may have authorised before
  // the conversation broke, so the claim is kept and recovery asks the gateway (Sprint 17).
  "420": failure("Communication error.", "COMMUNICATION_ERROR", "COMMUNICATION_FAILURE", "ambiguous"),
  "421": failure("Communication error with issuer.", "COMMUNICATION_ERROR_WITH_ISSUER", "COMMUNICATION_FAILURE", "ambiguous"),
  "430": failure("Duplicate transaction at processor.", "DUPLICATE_AT_PROCESSOR", "GATEWAY_FAILURE", "ambiguous"),
  "440": failure("Processor format error.", "PROCESSOR_FORMAT_ERROR", "GATEWAY_FAILURE", "incident"),
  "441": failure("Invalid transaction information.", "INVALID_TRANSACTION_INFORMATION", "GATEWAY_FAILURE", "incident"),
  "460": failure("Processor feature not available.", "PROCESSOR_FEATURE_NOT_AVAILABLE", "CONFIGURATION_FAILURE", "incident"),
  // Listed with the errors, but it is about the card the customer chose, and they can fix it.
  "461": decline("Unsupported card type.", "UNSUPPORTED_CARD_TYPE", "UNSUPPORTED_CARD_TYPE", D.INVALID_CARD),
};

/** Gateway `responsetext` values that signal a spent or stale Collect.js token (code 300). */
const TOKEN_REUSE_PATTERN = /invalid token|token (?:has )?(?:expired|already been used)|payment token/i;

export type SaleResultInput = { response: string; responseCode: string; responseText: string };

export type SaleResultClassification = ResultCodeEntry & {
  /** True when the code was not in the table and a fallback was used. Logged at warn. */
  unmapped: boolean;
};

/**
 * Read one sale answer. Never throws. An unmapped code falls back on the documented top-level
 * `response` field (1 approved, 2 declined, 3 error) and is flagged `unmapped` so the caller
 * logs it — an unfamiliar answer surfaces instead of hiding.
 */
export function classifySaleResult(result: SaleResultInput): SaleResultClassification {
  const { response, responseCode, responseText } = result;

  // The top-level response is authoritative for approval: money moved.
  if (response === "1") {
    const entry = RESULT_CODE_TABLE[responseCode];
    return entry?.handling === "approved"
      ? { ...entry, unmapped: false }
      : { ...RESULT_CODE_TABLE["100"]!, unmapped: responseCode !== "100" };
  }

  // A spent/expired Collect.js token is rejected as 300. The card is fine; re-entering it works.
  if (responseCode === "300" && TOKEN_REUSE_PATTERN.test(responseText)) {
    return {
      description: "Transaction was rejected by gateway.",
      internalReason: "PAYMENT_TOKEN_ALREADY_USED",
      classification: "DECLINED",
      handling: "decline",
      customerMessage: "REENTER_CARD",
      declineCode: D.ALREADY_USED,
      unmapped: false,
    };
  }

  const entry = RESULT_CODE_TABLE[responseCode];
  if (entry && entry.handling !== "approved") return { ...entry, unmapped: false };

  if (response === "2") {
    return {
      ...decline("Unmapped decline.", "UNMAPPED_DECLINE", "DECLINED", D.GENERIC_DECLINE),
      unmapped: true,
    };
  }
  // `3`, or anything else: the gateway could not process our request. Not the card.
  return {
    ...failure("Unmapped gateway error.", "UNMAPPED_GATEWAY_ERROR", "GATEWAY_FAILURE", "incident"),
    unmapped: true,
  };
}

/** Classifications that are incidents on our side and must page a human (rate-limited). */
export function isGatewayIncident(classification: PaymentAttemptClassification): boolean {
  return classification !== "APPROVED" && classification !== "DECLINED";
}
