// SPRINT-5: XML escaping, ASCII fold, well-formed ePOS-Print documents
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { escapeXml, foldToPrintableAscii, preparePrintText } from "./encoding";
import { documentHasCut, renderEposPrintXml, withReprintBanner } from "./epos-xml";
import { buildKitchenTicket } from "./layout";
import { wrapPrintRequest } from "./sdp";
import type { TicketOrderInput } from "./ticket-model";

const order: TicketOrderInput = {
  orderNumber: "HC-003",
  paidAt: new Date("2026-08-09T18:59:34.836Z"),
  timeZone: "America/Chicago",
  storeName: "Harold's Chicken Oak Lawn",
  customerFirstName: "José",
  customerLastName: "Nuñez",
  paymentStatus: "CAPTURED",
  cardLast4: null,
  subtotalCents: 879,
  taxCents: 89,
  tipCents: 0,
  totalCents: 968,
  lines: [
    {
      quantity: 1,
      itemName: "Fish & Chips",
      boardLabel: "FISH & CHIPS",
      customerNote: `Sauce <hot> & "smoky" it's fine`,
      selectedModifiers: [],
    },
  ],
};

describe("encoding", () => {
  it("escapes markup-significant characters", () => {
    assert.equal(escapeXml(`a & b <c> "d" 'e'`), "a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;");
  });

  it("folds accented letters to readable ASCII", () => {
    assert.equal(foldToPrintableAscii("José Nuñez"), "Jose Nunez");
  });
});

describe("ePOS-Print XML", () => {
  it("is well-formed, cuts, emphasises, and escapes order data", () => {
    const xml = renderEposPrintXml(buildKitchenTicket(order));
    assert.match(xml, /^<\?xml version="1.0" encoding="utf-8"\?>/);
    assert.match(xml, /xmlns="http:\/\/www.epson-pos.com\/schemas\/2011\/03\/epos-print"/);
    assert.equal(documentHasCut(xml), true);
    assert.match(xml, /<cut type="feed"\/>/);
    assert.match(xml, /width="2"/);
    assert.match(xml, /em="true"/);
    assert.match(xml, /align="center"/);
    assert.match(xml, /FISH &amp; CHIPS/);
    assert.doesNotMatch(xml, /FISH & CHIPS/);
    assert.match(xml, /Sauce &lt;hot&gt; &amp; &quot;smoky&quot; it&apos;s fine/);
    assert.match(xml, /Jose N\./);
    assert.doesNotMatch(xml, /José|Nuñez/);
    // Stored payload is byte-identical across repeats
    assert.equal(xml, renderEposPrintXml(buildKitchenTicket(order)));
  });

  it("wraps a print job id into PrintRequestInfo 2.00", () => {
    const inner = renderEposPrintXml(buildKitchenTicket(order));
    const wrapped = wrapPrintRequest({ printJobId: "abc123", eposXml: inner });
    assert.match(wrapped, /PrintRequestInfo Version="2.00"/);
    assert.match(wrapped, /<printjobid>abc123<\/printjobid>/);
    assert.match(wrapped, /<devid>local_printer<\/devid>/);
    assert.match(wrapped, /<PrintData>/);
    assert.match(wrapped, /FISH &amp; CHIPS/);
  });

  it("reprint banner is applied at send time without changing stored bytes", () => {
    const stored = renderEposPrintXml(buildKitchenTicket(order));
    const sent = withReprintBanner(stored);
    assert.notEqual(sent, stored);
    assert.match(sent, /\*\*\* REPRINT \*\*\*/);
    assert.equal(renderEposPrintXml(buildKitchenTicket(order)), stored);
  });
});

describe("preparePrintText", () => {
  it("folds then escapes", () => {
    assert.equal(preparePrintText("José & Co"), "Jose &amp; Co");
  });
});
