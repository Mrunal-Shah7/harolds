// SPRINT-4: error-translation tests — Square SDK errors never leak past this
// module; every case must land on our own taxonomy (declined / transport
// failure / thrown SquareClientError).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SquareError, SquareTimeoutError } from "square";

import { classifySquareError, SquareClientError } from "./errors";
import { PaymentDeclineCode, RefundDeclineCode } from "./types";

function makeSquareError(statusCode: number, code: string, category = "PAYMENT_METHOD_ERROR"): SquareError {
  return new SquareError({
    statusCode,
    body: { errors: [{ category, code }] },
  });
}

describe("classifySquareError — payment mode", () => {
  it("maps a card decline to a customer-safe declined outcome", () => {
    const result = classifySquareError(makeSquareError(402, "CARD_DECLINED"), "payment");
    assert.equal(result.outcome, "declined_payment");
    assert.equal((result as { code: PaymentDeclineCode }).code, PaymentDeclineCode.CARD_DECLINED);
  });

  it("maps insufficient funds to a declined outcome", () => {
    const result = classifySquareError(makeSquareError(402, "INSUFFICIENT_FUNDS"), "payment");
    assert.equal(result.outcome, "declined_payment");
  });

  it("treats a 5xx response as transport_failure", () => {
    const result = classifySquareError(makeSquareError(500, "INTERNAL_SERVER_ERROR"), "payment");
    assert.equal(result.outcome, "transport_failure");
  });

  it("treats a request timeout as transport_failure", () => {
    const result = classifySquareError(new SquareTimeoutError("timed out"), "payment");
    assert.equal(result.outcome, "transport_failure");
  });

  it("treats an idempotency key reuse as transport_failure (outcome indeterminate)", () => {
    const result = classifySquareError(makeSquareError(409, "IDEMPOTENCY_KEY_REUSED", "INVALID_REQUEST_ERROR"), "payment");
    assert.equal(result.outcome, "transport_failure");
  });

  it("treats an auth failure as a thrown client error, not a decline", () => {
    const result = classifySquareError(
      makeSquareError(401, "UNAUTHORIZED", "AUTHENTICATION_ERROR"),
      "payment",
    );
    assert.equal(result.outcome, "client_error");
    assert.ok((result as { error: SquareClientError }).error instanceof SquareClientError);
  });

  it("treats an unmapped validation error as a thrown client error", () => {
    const result = classifySquareError(
      makeSquareError(400, "MISSING_REQUIRED_PARAMETER", "INVALID_REQUEST_ERROR"),
      "payment",
    );
    assert.equal(result.outcome, "client_error");
  });

  it("treats a plain network error (no SquareError) as transport_failure", () => {
    const result = classifySquareError(new TypeError("fetch failed"), "payment");
    assert.equal(result.outcome, "transport_failure");
  });
});

describe("classifySquareError — refund mode", () => {
  it("maps a non-refundable payment to a declined refund outcome", () => {
    const result = classifySquareError(makeSquareError(400, "PAYMENT_NOT_REFUNDABLE", "REFUND_ERROR"), "refund");
    assert.equal(result.outcome, "declined_refund");
    assert.equal((result as { code: RefundDeclineCode }).code, RefundDeclineCode.NOT_REFUNDABLE);
  });

  it("treats a 5xx response as transport_failure", () => {
    const result = classifySquareError(makeSquareError(503, "SERVICE_UNAVAILABLE"), "refund");
    assert.equal(result.outcome, "transport_failure");
  });
});
