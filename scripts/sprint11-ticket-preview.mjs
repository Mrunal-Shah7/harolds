#!/usr/bin/env node
// SPRINT-11: record a kitchen ticket with several modifiers and a customer note (no physical printer).
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildKitchenTicket, renderEposPrintXml, renderPlainText } from "../packages/print/src/index.ts";

const order = {
  orderNumber: "HC-S11",
  paidAt: new Date("2026-08-15T18:59:34.000Z"),
  timeZone: "America/Chicago",
  storeName: "Harold's Chicken Oak Lawn",
  customerFirstName: "Jamal",
  customerLastName: "Wright",
  paymentStatus: "CAPTURED",
  cardLast4: "1111",
  subtotalCents: 2265,
  taxCents: 229,
  tipCents: 0,
  totalCents: 2494,
  lines: [
    {
      quantity: 1,
      itemName: "Half Chicken",
      boardLabel: "1/2 CHICKEN",
      customerNote: "Extra crispy if possible — no pickles",
      selectedModifiers: [
        { optionName: "Mild" },
        { optionName: "Add Fries" },
        { optionName: "Add Cheese" },
      ],
    },
  ],
};

const ticket = buildKitchenTicket(order);
const preview = renderPlainText(ticket);
const xml = renderEposPrintXml(ticket);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "docs", "sprint11-kitchen-ticket-preview.txt");
const body = [
  "// SPRINT-11: kitchen ticket with modifiers + note — plain-text preview and ePOS document.",
  "// Hardware: printer was not reachable on this machine; this is the recorded document, not paper.",
  "",
  "=== PLAIN TEXT PREVIEW ===",
  preview,
  "",
  "=== EPOS-PRINT XML ===",
  xml,
  "",
].join("\n");
writeFileSync(out, body);
if (!preview.includes("MILD") || !preview.includes("ADD FRIES") || !preview.includes("ADD CHEESE") || !preview.includes("NOTE:")) {
  console.error("preview missing expected modifier/note lines");
  console.error(preview);
  process.exit(1);
}
console.log(`wrote ${out}`);
console.log(preview);
