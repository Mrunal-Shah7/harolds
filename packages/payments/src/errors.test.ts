// SPRINT-4 / SPRINT-17 / SPRINT-18.3: refund and transport classification. Sale results moved
// to result-codes.test.ts, which checks them against the Merchant Pay Connect Result Code Table.
//
// The distinction these tests protect: a refused reversal is definite, a transport failure
// means the reversal may exist and must be reconciled.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyRefundResult, classifyTransportError, PaymentClientError } from "./errors";
import { RefundDeclineCode } from "./types";

const errored = (responseCode: string, responseText = "ERROR") => ({
  response: "3",
  responseCode,
  responseText,
});

describe("refund classification (unchanged in Sprint 18.3)", () => {
  it("maps refund rejections to the refund vocabulary", () => {
    const notRefundable = classifyRefundResult(errored("300", "Transaction not refundable"));
    assert.equal(notRefundable.outcome, "declined_refund");
    assert.equal(
      notRefundable.outcome === "declined_refund" && notRefundable.code,
      RefundDeclineCode.NOT_REFUNDABLE,
    );

    const amountInvalid = classifyRefundResult(errored("441"));
    assert.equal(
      amountInvalid.outcome === "declined_refund" && amountInvalid.code,
      RefundDeclineCode.AMOUNT_INVALID,
    );
  });

  it("does not apply the token-reuse rule to refunds", () => {
    const result = classifyRefundResult(errored("300", "Invalid token"));
    assert.equal(result.outcome, "declined_refund");
    assert.equal(
      result.outcome === "declined_refund" && result.code,
      RefundDeclineCode.NOT_REFUNDABLE,
    );
  });

  it("treats communication and duplicate codes as indeterminate", () => {
    for (const code of ["420", "421", "430", "460"]) {
      assert.equal(classifyRefundResult(errored(code)).outcome, "transport_failure", `code ${code}`);
    }
  });

  it("raises a client error for bad credentials", () => {
    for (const code of ["410", "411"]) {
      const result = classifyRefundResult(errored(code));
      assert.equal(result.outcome, "client_error");
      assert.ok(result.outcome === "client_error" && result.error instanceof PaymentClientError);
    }
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
