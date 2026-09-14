// SPRINT-4 / SPRINT-17: gateway result classification.
//
// The distinction these tests protect is the one the customer feels: a DECLINE is definite and
// they may safely retry, a TRANSPORT FAILURE means the charge may exist and they must not.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyNmiResult, classifyTransportError, PaymentClientError } from "./errors";
import { PaymentDeclineCode, RefundDeclineCode } from "./types";

const declined = (responseCode: string, responseText = "DECLINE") => ({
  response: "2",
  responseCode,
  responseText,
});
const errored = (responseCode: string, responseText = "ERROR") => ({
  response: "3",
  responseCode,
  responseText,
});

describe("payment classification", () => {
  it("maps NMI decline codes to our vocabulary", () => {
    const cases: Array<[string, PaymentDeclineCode]> = [
      ["200", PaymentDeclineCode.CARD_DECLINED],
      ["201", PaymentDeclineCode.CALL_ISSUER],
      ["202", PaymentDeclineCode.INSUFFICIENT_FUNDS],
      ["203", PaymentDeclineCode.TRANSACTION_LIMIT_EXCEEDED],
      ["223", PaymentDeclineCode.CARD_EXPIRED],
      ["225", PaymentDeclineCode.CVV_FAILURE],
      ["461", PaymentDeclineCode.INVALID_CARD],
    ];
    for (const [code, expected] of cases) {
      const result = classifyNmiResult(declined(code), "payment");
      assert.equal(result.outcome, "declined_payment", `code ${code}`);
      assert.equal(result.outcome === "declined_payment" && result.code, expected);
    }
  });

  it("falls back to a generic decline for an unmapped decline code", () => {
    const result = classifyNmiResult(declined("299"), "payment");
    assert.equal(result.outcome, "declined_payment");
    assert.equal(
      result.outcome === "declined_payment" && result.code,
      PaymentDeclineCode.GENERIC_DECLINE,
    );
  });

  it("treats communication and duplicate codes as INDETERMINATE, never as a decline", () => {
    // 420/421 are comms failures and 430 is a duplicate at the processor: in all three the
    // charge may exist. Reporting these as a clean decline is what produces a double charge.
    for (const code of ["420", "421", "430", "460"]) {
      const result = classifyNmiResult(errored(code), "payment");
      assert.equal(result.outcome, "transport_failure", `code ${code}`);
    }
  });

  it("raises a client error for bad credentials rather than blaming the card", () => {
    for (const code of ["410", "411"]) {
      const result = classifyNmiResult(errored(code, "Invalid merchant configuration"), "payment");
      assert.equal(result.outcome, "client_error");
      assert.ok(result.outcome === "client_error" && result.error instanceof PaymentClientError);
      assert.equal(result.outcome === "client_error" && result.error.kind, "auth");
    }
  });

  it("reads a spent Collect.js token as ALREADY_USED, not a card decline", () => {
    const result = classifyNmiResult(
      errored("300", "Invalid token - token has expired"),
      "payment",
    );
    assert.equal(result.outcome, "declined_payment");
    assert.equal(
      result.outcome === "declined_payment" && result.code,
      PaymentDeclineCode.ALREADY_USED,
    );
  });

  it("never leaks the gateway's raw responsetext into a customer-facing reason", () => {
    const result = classifyNmiResult(declined("202", "INSUFFICIENT FUNDS REFID:12345"), "payment");
    assert.equal(result.outcome, "declined_payment");
    const reason = result.outcome === "declined_payment" ? result.reason : "";
    assert.doesNotMatch(reason, /REFID/);
    assert.doesNotMatch(reason, /202/);
  });

  it("rejects an unmapped gateway error as a client error", () => {
    const result = classifyNmiResult(errored("440", "Processor format error"), "payment");
    assert.equal(result.outcome, "client_error");
    assert.equal(result.outcome === "client_error" && result.error.kind, "invalid_request");
  });
});

describe("refund classification", () => {
  it("maps refund rejections to the refund vocabulary", () => {
    const notRefundable = classifyNmiResult(errored("300", "Transaction not refundable"), "refund");
    assert.equal(notRefundable.outcome, "declined_refund");
    assert.equal(
      notRefundable.outcome === "declined_refund" && notRefundable.code,
      RefundDeclineCode.NOT_REFUNDABLE,
    );

    const amountInvalid = classifyNmiResult(errored("441"), "refund");
    assert.equal(
      amountInvalid.outcome === "declined_refund" && amountInvalid.code,
      RefundDeclineCode.AMOUNT_INVALID,
    );
  });

  it("does not apply the token-reuse rule to refunds", () => {
    // The ALREADY_USED shortcut is payment-only; a refund rejected with code 300 is simply
    // not refundable, and must not be reported as a reusable-token problem.
    const result = classifyNmiResult(errored("300", "Invalid token"), "refund");
    assert.equal(result.outcome, "declined_refund");
    assert.equal(
      result.outcome === "declined_refund" && result.code,
      RefundDeclineCode.NOT_REFUNDABLE,
    );
  });
});

describe("transport error classification", () => {
  it("names a timeout distinctly", () => {
    const err = new Error("timed out");
    err.name = "TimeoutError";
    assert.match(classifyTransportError(err).message, /timed out/i);
  });

  it("treats an arbitrary network failure as unreachable", () => {
    assert.equal(classifyTransportError(new TypeError("fetch failed")).outcome, "transport_failure");
  });
});
