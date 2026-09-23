// SPRINT-18.3: the sale result mapping, iterated against the Merchant Pay Connect Result Code
// Table. DOCUMENTED below is copied from docs/Merchant Pay Connect INC-Direct-Post-API.md
// ("Result Code Table", plus 301 from "Rate Limits") and is the independent statement the
// mapping is checked against — a code can be neither missing from the mapping nor invented by it.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifySaleResult, CustomerMessage, isGatewayIncident, RESULT_CODE_TABLE } from "./result-codes";

const DOCUMENTED: Record<string, string> = {
  "100": "Transaction was approved.",
  "200": "Transaction was declined by processor.",
  "201": "Do not honor.",
  "202": "Insufficient funds.",
  "203": "Over limit.",
  "204": "Transaction not allowed.",
  "220": "Incorrect payment information.",
  "221": "No such card issuer.",
  "222": "No card number on file with issuer.",
  "223": "Expired card.",
  "224": "Invalid expiration date.",
  "225": "Invalid card security code.",
  "226": "Invalid PIN.",
  "240": "Call issuer for further information.",
  "250": "Pick up card.",
  "251": "Lost card.",
  "252": "Stolen card.",
  "253": "Fraudulent card.",
  "260": "Declined with further instructions available. (See response text)",
  "261": "Declined-Stop all recurring payments.",
  "262": "Declined-Stop this recurring program.",
  "263": "Declined-Update cardholder data available.",
  "264": "Declined-Retry in a few days.",
  "300": "Transaction was rejected by gateway.",
  "301": "Rate limit exceeded.",
  "400": "Transaction error returned by processor.",
  "410": "Invalid merchant configuration.",
  "411": "Merchant account is inactive.",
  "420": "Communication error.",
  "421": "Communication error with issuer.",
  "430": "Duplicate transaction at processor.",
  "440": "Processor format error.",
  "441": "Invalid transaction information.",
  "460": "Processor feature not available.",
  "461": "Unsupported card type.",
};

/**
 * The expected reading of every documented code: [internal reason, handling, customer message].
 * Written out in full so a change to any one mapping has to be made twice, deliberately.
 */
const EXPECTED: Record<string, [string, string, keyof typeof CustomerMessage | null]> = {
  "100": ["APPROVED", "approved", null],
  "200": ["DECLINED_BY_PROCESSOR", "decline", "DECLINED"],
  "201": ["DO_NOT_HONOR", "decline", "DECLINED"],
  "202": ["INSUFFICIENT_FUNDS", "decline", "INSUFFICIENT_FUNDS"],
  "203": ["OVER_LIMIT", "decline", "OVER_LIMIT"],
  "204": ["TRANSACTION_NOT_ALLOWED", "decline", "DECLINED"],
  "220": ["INCORRECT_PAYMENT_INFORMATION", "decline", "CHECK_CARD_DETAILS"],
  "221": ["NO_SUCH_CARD_ISSUER", "decline", "CHECK_CARD_DETAILS"],
  "222": ["NO_CARD_NUMBER_ON_FILE", "decline", "CHECK_CARD_DETAILS"],
  "223": ["EXPIRED_CARD", "decline", "EXPIRED_CARD"],
  "224": ["INVALID_EXPIRATION_DATE", "decline", "CHECK_EXPIRY"],
  "225": ["INVALID_SECURITY_CODE", "decline", "CHECK_SECURITY_CODE"],
  "226": ["INVALID_PIN", "decline", "DECLINED"],
  "240": ["CALL_ISSUER", "decline", "CALL_ISSUER"],
  "250": ["PICK_UP_CARD", "decline", "DECLINED"],
  "251": ["LOST_CARD", "decline", "DECLINED"],
  "252": ["STOLEN_CARD", "decline", "DECLINED"],
  "253": ["FRAUDULENT_CARD", "decline", "DECLINED"],
  "260": ["DECLINED_WITH_INSTRUCTIONS", "decline", "DECLINED"],
  "261": ["STOP_ALL_RECURRING", "decline", "DECLINED"],
  "262": ["STOP_THIS_RECURRING", "decline", "DECLINED"],
  "263": ["UPDATE_CARDHOLDER_DATA_AVAILABLE", "decline", "UPDATED_CARD"],
  "264": ["RETRY_IN_A_FEW_DAYS", "decline", "DECLINED"],
  "300": ["REJECTED_BY_GATEWAY", "incident", "PAYMENTS_UNAVAILABLE"],
  "301": ["RATE_LIMITED", "incident", "PAYMENTS_UNAVAILABLE"],
  "400": ["PROCESSOR_ERROR", "incident", "PAYMENTS_UNAVAILABLE"],
  "410": ["INVALID_MERCHANT_CONFIGURATION", "incident", "PAYMENTS_UNAVAILABLE"],
  "411": ["MERCHANT_ACCOUNT_INACTIVE", "incident", "PAYMENTS_UNAVAILABLE"],
  "420": ["COMMUNICATION_ERROR", "ambiguous", "COULD_NOT_CONFIRM"],
  "421": ["COMMUNICATION_ERROR_WITH_ISSUER", "ambiguous", "COULD_NOT_CONFIRM"],
  "430": ["DUPLICATE_AT_PROCESSOR", "ambiguous", "COULD_NOT_CONFIRM"],
  "440": ["PROCESSOR_FORMAT_ERROR", "incident", "PAYMENTS_UNAVAILABLE"],
  "441": ["INVALID_TRANSACTION_INFORMATION", "incident", "PAYMENTS_UNAVAILABLE"],
  "460": ["PROCESSOR_FEATURE_NOT_AVAILABLE", "incident", "PAYMENTS_UNAVAILABLE"],
  "461": ["UNSUPPORTED_CARD_TYPE", "decline", "UNSUPPORTED_CARD_TYPE"],
};

/** The top-level `response` the gateway would send alongside each code. */
function responseFor(code: string): string {
  if (code === "100") return "1";
  if (code.startsWith("2")) return "2";
  return "3";
}

describe("the result code table", () => {
  it("maps exactly the documented codes, with the documented descriptions", () => {
    assert.deepEqual(Object.keys(RESULT_CODE_TABLE).sort(), Object.keys(DOCUMENTED).sort());
    for (const [code, description] of Object.entries(DOCUMENTED)) {
      assert.equal(RESULT_CODE_TABLE[code]!.description, description, `description for ${code}`);
    }
  });

  for (const [code, [reason, handling, message]] of Object.entries(EXPECTED)) {
    it(`${code} ${DOCUMENTED[code]} → ${reason} (${handling})`, () => {
      const read = classifySaleResult({ response: responseFor(code), responseCode: code, responseText: "X" });
      assert.equal(read.unmapped, false);
      assert.equal(read.internalReason, reason);
      assert.equal(read.handling, handling);
      if (message) assert.equal(read.customerMessage, message);
      // Declines are about the card; every other non-approval is an incident on our side.
      assert.equal(isGatewayIncident(read.classification), handling === "incident" || handling === "ambiguous");
    });
  }
});

describe("the distinctions this sprint exists for", () => {
  it("201 Do Not Honor and 240 Call Issuer are different answers", () => {
    const doNotHonor = classifySaleResult({ response: "2", responseCode: "201", responseText: "DECLINE" });
    const callIssuer = classifySaleResult({ response: "2", responseCode: "240", responseText: "CALL" });
    assert.notEqual(doNotHonor.internalReason, callIssuer.internalReason);
    assert.equal(doNotHonor.internalReason, "DO_NOT_HONOR");
    assert.equal(callIssuer.internalReason, "CALL_ISSUER");
    assert.notEqual(doNotHonor.customerMessage, callIssuer.customerMessage);
    assert.notEqual(doNotHonor.declineCode, callIssuer.declineCode);
  });

  it("the fraud family reads exactly like an ordinary decline to the customer", () => {
    const ordinary = classifySaleResult({ response: "2", responseCode: "200", responseText: "DECLINE" });
    for (const code of ["250", "251", "252", "253"]) {
      const read = classifySaleResult({ response: "2", responseCode: code, responseText: "DECLINE" });
      assert.equal(read.customerMessage, ordinary.customerMessage, code);
      assert.equal(read.declineCode, ordinary.declineCode, `public category for ${code}`);
    }
  });

  it("no customer-facing sentence ever names fraud, theft, or a stolen or lost card", () => {
    for (const sentence of Object.values(CustomerMessage)) {
      assert.doesNotMatch(sentence, /fraud|stolen|theft|steal|lost|pick ?up|reported/i, sentence);
    }
  });

  it("a gateway incident's customer sentence says nothing about the card", () => {
    assert.doesNotMatch(CustomerMessage.PAYMENTS_UNAVAILABLE, /card|declin/i);
  });

  it("4xx configuration and communication codes are never declines", () => {
    for (const code of ["410", "411", "420", "421", "460"]) {
      const read = classifySaleResult({ response: "3", responseCode: code, responseText: "X" });
      assert.notEqual(read.classification, "DECLINED", code);
      assert.notEqual(read.handling, "decline", code);
    }
    assert.equal(classifySaleResult({ response: "3", responseCode: "411", responseText: "" }).classification, "CONFIGURATION_FAILURE");
    assert.equal(classifySaleResult({ response: "3", responseCode: "420", responseText: "" }).classification, "COMMUNICATION_FAILURE");
  });

  it("the customer can act on an expired card, a wrong expiry, or a wrong security code", () => {
    assert.match(CustomerMessage[classifySaleResult({ response: "2", responseCode: "223", responseText: "" }).customerMessage], /expired/i);
    assert.match(CustomerMessage[classifySaleResult({ response: "2", responseCode: "224", responseText: "" }).customerMessage], /expiry date/i);
    assert.match(CustomerMessage[classifySaleResult({ response: "2", responseCode: "225", responseText: "" }).customerMessage], /security code/i);
  });
});

describe("answers outside the table", () => {
  it("an unmapped decline code falls back on response=2 and is flagged", () => {
    const read = classifySaleResult({ response: "2", responseCode: "299", responseText: "?" });
    assert.equal(read.unmapped, true);
    assert.equal(read.handling, "decline");
    assert.equal(read.customerMessage, "DECLINED");
  });

  it("an unmapped error code is an incident, never a decline, and is flagged", () => {
    const read = classifySaleResult({ response: "3", responseCode: "499", responseText: "?" });
    assert.equal(read.unmapped, true);
    assert.equal(read.handling, "incident");
    assert.equal(read.classification, "GATEWAY_FAILURE");
  });

  it("response=1 is an approval even if the code is unfamiliar — and the oddity is flagged", () => {
    const read = classifySaleResult({ response: "1", responseCode: "", responseText: "SUCCESS" });
    assert.equal(read.handling, "approved");
    assert.equal(read.unmapped, true);
  });

  it("a spent Collect.js token is 'please re-enter', not a decline of the card or an incident", () => {
    const read = classifySaleResult({ response: "3", responseCode: "300", responseText: "Invalid token - token has expired" });
    assert.equal(read.internalReason, "PAYMENT_TOKEN_ALREADY_USED");
    assert.equal(read.customerMessage, "REENTER_CARD");
  });

  it("never throws on garbage", () => {
    for (const input of [{ response: "", responseCode: "", responseText: "" }, { response: "9", responseCode: "abc", responseText: "" }]) {
      assert.doesNotThrow(() => classifySaleResult(input));
    }
  });
});
