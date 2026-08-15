// SPRINT-7: customer and manager message copy — transactional only, store-local time, stored cents.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatCents } from "@harolds/pricing";
import { formatStoreLocalTime } from "./time";
import {
  renderPaymentDiscrepancyAlert,
  renderPrintFailedAlert,
  renderJobDeadAlert,
  renderUnackedAlert,
} from "./templates-alerts";
import { renderReceiptHtml, renderReceiptText, type ReceiptEmailInput } from "./templates-email";
import { renderOrderConfirmationSms, renderOrderReadySms, smsContainsMoney } from "./templates-sms";

const RICH: ReceiptEmailInput = {
  storeName: "Harold's Chicken Oak Lawn",
  addressLine1: "4709 W 95th St",
  addressLine2: null,
  city: "Oak Lawn",
  state: "IL",
  postalCode: "60453-2515",
  orderNumber: "HC-042",
  estimatedReadyAt: new Date("2026-08-15T22:20:00.000Z"),
  timeZone: "America/Chicago",
  customerNote: "Extra mild sauce on the side please, and knock because the dog barks.",
  lines: [
    {
      quantity: 2,
      itemName: "6pc Dark",
      customerNote: "No gizzards",
      modifiers: ["Mild sauce", "White bread", "Extra fries"],
      lineTotalCents: 2598,
    },
    {
      quantity: 1,
      itemName: "10pc Mixed",
      customerNote: null,
      modifiers: ["Hot sauce", "Fried hard"],
      lineTotalCents: 1899,
    },
    {
      quantity: 3,
      itemName: "Wing dings",
      customerNote: "Well done",
      modifiers: ["Lemon pepper", "Ranch"],
      lineTotalCents: 2100,
    },
  ],
  subtotalCents: 6597,
  taxCents: 666,
  tipCents: 800,
  totalCents: 8063,
};

describe("SMS copy", () => {
  it("confirmation has order number, store name, local ready time, and no money", () => {
    const readyAt = new Date("2026-08-15T22:20:00.000Z");
    const body = renderOrderConfirmationSms({
      storeName: "Harold's Chicken Oak Lawn",
      orderNumber: "HC-042",
      estimatedReadyAt: readyAt,
      timeZone: "America/Chicago",
    });
    assert.match(body, /Harold's Chicken Oak Lawn/);
    assert.match(body, /HC-042/);
    const local = formatStoreLocalTime(readyAt, "America/Chicago");
    assert.ok(body.includes(local));
    assert.equal(smsContainsMoney(body), false);
    assert.equal(body.includes("$"), false);
  });

  it("ready message is only the order number and pickup", () => {
    const body = renderOrderReadySms("HC-042");
    assert.equal(body, "Order HC-042 is ready for pickup.");
    assert.equal(smsContainsMoney(body), false);
  });
});

describe("email receipt", () => {
  it("plain text and HTML carry stored cents exactly and stay legible with many lines", () => {
    const text = renderReceiptText(RICH);
    const html = renderReceiptHtml(RICH);
    assert.match(text, /HC-042/);
    assert.match(text, /6pc Dark/);
    assert.match(text, /Mild sauce/);
    assert.match(text, /Extra mild sauce/);
    assert.match(text, /Pickup at the counter/);
    assert.ok(text.includes(formatCents(6597)));
    assert.ok(text.includes(formatCents(666)));
    assert.ok(text.includes(formatCents(800)));
    assert.ok(text.includes(formatCents(8063)));
    assert.equal(text.includes("come back"), false);
    assert.equal(text.toLowerCase().includes("discount"), false);
    assert.match(html, /<html/);
    assert.match(html, /6pc Dark/);
    assert.ok(html.includes(formatCents(8063)));
    assert.ok(!html.includes("lookup"));
  });

  it("escapes customer notes and item names that contain markup", () => {
    const html = renderReceiptHtml({
      ...RICH,
      customerNote: `<img src=x onerror=alert(1)>`,
      lines: [
        {
          quantity: 1,
          itemName: `2pc Dark</td><script>alert(1)</script>`,
          customerNote: `<b>bold</b>`,
          modifiers: ["Mild & Hot"],
          lineTotalCents: 879,
        },
      ],
    });
    assert.equal(html.includes("<script>"), false);
    assert.equal(html.includes("<img"), false);
    assert.match(html, /&lt;b&gt;bold&lt;\/b&gt;/);
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /Mild &amp; Hot/);
  });
});

describe("manager alerts", () => {
  it("every type names the order, the problem, and the action", () => {
    const print = renderPrintFailedAlert({
      orderNumber: "HC-042",
      orderId: "ord_1",
      target: "KITCHEN_TICKET",
      lastError: "offline",
      printerSerial: "XBVN044247",
    });
    assert.match(print.sms, /HC-042/);
    assert.match(print.sms, /KITCHEN_TICKET/);
    assert.match(print.sms, /reprint/i);

    const unack = renderUnackedAlert({
      orderNumber: "HC-042",
      orderId: "ord_1",
      reason: "Paid order has not been moved to in progress.",
    });
    assert.match(unack.sms, /HC-042/);
    assert.match(unack.emailText, /kitchen display/i);

    const dead = renderJobDeadAlert({
      deadJobId: "job_1",
      deadJobType: "SMS_ORDER_CONFIRMATION",
      orderId: "ord_1",
      lastError: "timeout",
      attemptCount: 5,
    });
    assert.match(dead.sms, /dead/i);
    assert.match(dead.emailText, /retry/i);

    const pay = renderPaymentDiscrepancyAlert({
      orderId: "ord_1",
      kind: "AMOUNT_MISMATCH",
      processorPaymentId: "sq_1",
      orderTotalCents: 1000,
      squareAmountCents: 900,
      detail: "Paid order total does not match Square captured amount",
    });
    assert.match(pay.sms, /ord_1/);
    assert.match(pay.emailText, /Reconcile/i);
  });
});
