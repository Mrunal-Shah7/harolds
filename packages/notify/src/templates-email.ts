// SPRINT-7: transactional email receipt — stored cents only, HTML + plain text.
import { formatCents } from "@harolds/pricing";
import { formatStoreLocalDateTime } from "./time";

export type ReceiptLine = {
  quantity: number;
  itemName: string;
  customerNote: string | null;
  modifiers: string[];
  lineTotalCents: number;
};

export type ReceiptEmailInput = {
  storeName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  orderNumber: string;
  estimatedReadyAt: Date | null;
  timeZone: string;
  customerNote: string | null;
  lines: ReceiptLine[];
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
};

export function storeAddressBlock(input: ReceiptEmailInput): string {
  const line2 = input.addressLine2 ? `\n${input.addressLine2}` : "";
  return `${input.storeName}\n${input.addressLine1}${line2}\n${input.city}, ${input.state} ${input.postalCode}`;
}

function linePlain(line: ReceiptLine): string {
  const mods = line.modifiers.length ? ` (${line.modifiers.join(", ")})` : "";
  const note = line.customerNote ? `\n    Note: ${line.customerNote}` : "";
  return `  ${line.quantity}× ${line.itemName}${mods}  ${formatCents(line.lineTotalCents)}${note}`;
}

export function renderReceiptText(input: ReceiptEmailInput): string {
  const ready = input.estimatedReadyAt
    ? `\nEstimated ready: ${formatStoreLocalDateTime(input.estimatedReadyAt, input.timeZone)}`
    : "";
  const note = input.customerNote ? `\nOrder note: ${input.customerNote}` : "";
  const lines = input.lines.map(linePlain).join("\n");
  return [
    storeAddressBlock(input),
    "",
    `Receipt for order ${input.orderNumber}`,
    "Pickup at the counter. Give them your order number.",
    ready.trim(),
    note.trim(),
    "",
    "Items",
    lines,
    "",
    `Subtotal  ${formatCents(input.subtotalCents)}`,
    `Tax       ${formatCents(input.taxCents)}`,
    `Tip       ${formatCents(input.tipCents)}`,
    `Total     ${formatCents(input.totalCents)}`,
    "",
    "This is a receipt for the order you placed. It is not a marketing message.",
  ]
    .filter((row) => row !== "")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function lineHtml(line: ReceiptLine): string {
  const mods = line.modifiers.length
    ? `<div style="color:#444;font-size:14px">${escapeHtml(line.modifiers.join(", "))}</div>`
    : "";
  const note = line.customerNote
    ? `<div style="color:#444;font-size:14px">Note: ${escapeHtml(line.customerNote)}</div>`
    : "";
  return `<tr>
    <td style="padding:8px 0;vertical-align:top">${line.quantity}× ${escapeHtml(line.itemName)}${mods}${note}</td>
    <td style="padding:8px 0;text-align:right;vertical-align:top">${escapeHtml(formatCents(line.lineTotalCents))}</td>
  </tr>`;
}

export function renderReceiptHtml(input: ReceiptEmailInput): string {
  const ready = input.estimatedReadyAt
    ? `<p>Estimated ready: ${escapeHtml(formatStoreLocalDateTime(input.estimatedReadyAt, input.timeZone))}</p>`
    : "";
  const note = input.customerNote ? `<p>Order note: ${escapeHtml(input.customerNote)}</p>` : "";
  const addr2 = input.addressLine2 ? `${escapeHtml(input.addressLine2)}<br>` : "";
  return `<!DOCTYPE html>
<html lang="en">
<body style="font-family:Georgia,serif;color:#111;max-width:32rem">
  <h1 style="font-size:1.25rem">${escapeHtml(input.storeName)}</h1>
  <p>${escapeHtml(input.addressLine1)}<br>${addr2}${escapeHtml(input.city)}, ${escapeHtml(input.state)} ${escapeHtml(input.postalCode)}</p>
  <p><strong>Order ${escapeHtml(input.orderNumber)}</strong></p>
  <p>Pickup at the counter. Give them your order number.</p>
  ${ready}${note}
  <table style="width:100%;border-collapse:collapse">${input.lines.map(lineHtml).join("")}</table>
  <p>Subtotal ${escapeHtml(formatCents(input.subtotalCents))}<br>
  Tax ${escapeHtml(formatCents(input.taxCents))}<br>
  Tip ${escapeHtml(formatCents(input.tipCents))}<br>
  <strong>Total ${escapeHtml(formatCents(input.totalCents))}</strong></p>
  <p style="font-size:0.85rem;color:#444">This is a receipt for the order you placed. It is not a marketing message.</p>
</body>
</html>`;
}

export function receiptSubject(storeName: string, orderNumber: string): string {
  return `${storeName} receipt — order ${orderNumber}`;
}
