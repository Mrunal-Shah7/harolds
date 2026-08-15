// SPRINT-5: kitchen + counter ticket layout from order-line snapshots only
import type { TicketLine, TicketModel, TicketOrderInput } from "./ticket-model";
import { TICKET_COLUMNS } from "./ticket-model";
import { foldToPrintableAscii } from "./encoding";

function rule(): TicketLine {
  return { text: "-".repeat(TICKET_COLUMNS), align: "left", role: "rule" };
}

function customerCallName(first: string, last: string): string {
  const f = foldToPrintableAscii(first).trim();
  const lastInitial = foldToPrintableAscii(last).trim().charAt(0);
  if (lastInitial) return `${f} ${lastInitial}.`;
  return f;
}

function formatStoreDateTime(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(instant);
  const grab = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const month = grab("month");
  const day = grab("day");
  const year = grab("year");
  const hour = grab("hour");
  const minute = grab("minute");
  const dayPeriod = grab("dayPeriod").toUpperCase();
  return `${month}/${day}/${year}  ${hour}:${minute} ${dayPeriod}`;
}

function formatUsd(cents: number): string {
  const dollars = Math.floor(Math.abs(cents) / 100);
  const rem = Math.abs(cents) % 100;
  return `$${dollars}.${rem.toString().padStart(2, "0")}`;
}

function wrap(text: string, width: number, hangIndent: number): string[] {
  const folded = foldToPrintableAscii(text).replace(/\s+/g, " ").trim();
  if (!folded) return [];
  if (folded.length <= width) return [folded];
  const lines: string[] = [];
  let remaining = folded;
  let first = true;
  while (remaining.length > 0) {
    const col = first ? width : Math.max(1, width - hangIndent);
    if (remaining.length <= col) {
      lines.push(first ? remaining : " ".repeat(hangIndent) + remaining);
      break;
    }
    let breakAt = remaining.lastIndexOf(" ", col);
    if (breakAt <= 0) breakAt = col;
    const chunk = remaining.slice(0, breakAt).trimEnd();
    lines.push(first ? chunk : " ".repeat(hangIndent) + chunk);
    remaining = remaining.slice(breakAt).trimStart();
    first = false;
  }
  return lines;
}

function boardName(line: TicketOrderInput["lines"][number]): string {
  const raw = (line.boardLabel && line.boardLabel.trim()) || line.itemName;
  return foldToPrintableAscii(raw).toUpperCase();
}

function itemHeader(quantity: number, name: string): string {
  if (quantity > 1) return `${quantity} X ${name}`;
  return name;
}

function moneyRow(label: string, cents: number): TicketLine {
  const amount = formatUsd(cents);
  const pad = Math.max(1, TICKET_COLUMNS - label.length - amount.length);
  return { text: `${label}${" ".repeat(pad)}${amount}`, align: "left", role: "money" };
}

function itemBlock(line: TicketOrderInput["lines"][number]): TicketLine[] {
  const out: TicketLine[] = [];
  const name = boardName(line);
  const header = itemHeader(line.quantity, name);
  const wrapped = wrap(header, TICKET_COLUMNS, 2);
  for (const w of wrapped) {
    out.push({ text: w, align: "left", weight: "emphasis", role: "item" });
  }
  for (const mod of line.selectedModifiers) {
    const modText = foldToPrintableAscii(mod.optionName).toUpperCase();
    const wrappedMod = wrap(modText, TICKET_COLUMNS - 2, 2);
    for (const w of wrappedMod) {
      out.push({ text: `  ${w.trimStart()}`, align: "left", size: "small", role: "modifier" });
    }
  }
  const note = line.customerNote?.trim();
  if (note) {
    const noteBody = foldToPrintableAscii(note);
    const wrappedNote = wrap(`NOTE: ${noteBody}`, TICKET_COLUMNS - 2, 2);
    for (const w of wrappedNote) {
      out.push({ text: `  ${w.trimStart()}`, align: "left", size: "small", role: "note" });
    }
  }
  return out;
}

function sharedHeader(order: TicketOrderInput, emphasis: string): TicketLine[] {
  const when = formatStoreDateTime(order.paidAt, order.timeZone);
  const name = customerCallName(order.customerFirstName, order.customerLastName);
  const paid =
    order.paymentStatus === "CAPTURED" || order.paymentStatus === "PAID" || order.paymentStatus === "AUTHORISED"
      ? "** PAID **"
      : `** ${order.paymentStatus} **`;
  return [
    { text: order.orderNumber, align: "center", weight: "double", role: "header" },
    rule(),
    { text: when, align: "left", role: "header" },
    { text: "ONLINE", align: "left", role: "header" },
    { text: name, align: "left", weight: "emphasis", role: "header" },
    { text: paid, align: "center", weight: "emphasis", role: "header" },
    { text: emphasis, align: "center", weight: "emphasis", role: "emphasis" },
    rule(),
  ];
}

function sharedFooter(order: TicketOrderInput): TicketLine[] {
  return [
    rule(),
    { text: order.orderNumber, align: "center", weight: "double", role: "footer" },
    { text: foldToPrintableAscii(order.storeName), align: "center", role: "footer" },
  ];
}

/** Kitchen ticket — no money anywhere. Matches the in-store layout with online-order deltas. */
export function buildKitchenTicket(order: TicketOrderInput): TicketModel {
  const lines: TicketLine[] = [
    ...sharedHeader(order, "ONLINE PICKUP"),
    ...order.lines.flatMap(itemBlock),
    ...sharedFooter(order),
  ];
  return { kind: "kitchen", orderNumber: order.orderNumber, lines };
}

/** Counter receipt — same identity + items, plus stored money (never recomputed). */
export function buildCounterReceipt(order: TicketOrderInput): TicketModel {
  const money: TicketLine[] = [
    rule(),
    moneyRow("SUBTOTAL", order.subtotalCents),
    moneyRow("TAX", order.taxCents),
    moneyRow("TIP", order.tipCents),
    moneyRow("TOTAL", order.totalCents),
    { text: `PAYMENT  ${order.paymentStatus}`, align: "left", role: "money" },
  ];
  if (order.cardLast4) {
    money.push({ text: `CARD  ****${order.cardLast4}`, align: "left", role: "money" });
  }
  const lines: TicketLine[] = [
    ...sharedHeader(order, "COUNTER RECEIPT"),
    ...order.lines.flatMap(itemBlock),
    ...money,
    ...sharedFooter(order),
  ];
  return { kind: "counter", orderNumber: order.orderNumber, lines };
}

/** Plain-text preview for tests and notes — not sent to the printer. */
export function renderPlainText(ticket: TicketModel): string {
  return ticket.lines
    .map((line) => {
      const text = line.text;
      const align = line.align ?? "left";
      if (align === "center") {
        if (text.length >= TICKET_COLUMNS) return text;
        const pad = Math.floor((TICKET_COLUMNS - text.length) / 2);
        return " ".repeat(pad) + text;
      }
      if (align === "right") {
        if (text.length >= TICKET_COLUMNS) return text;
        return " ".repeat(TICKET_COLUMNS - text.length) + text;
      }
      return text;
    })
    .join("\n");
}
