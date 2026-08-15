// SPRINT-5: ePOS-Print XML renderer — TM-m30III document from a TicketModel
import type { TicketLine, TicketModel } from "./ticket-model";
import { preparePrintText } from "./encoding";

const EPOS_NS = "http://www.epson-pos.com/schemas/2011/03/epos-print";

function textElement(line: TicketLine): string {
  const body = preparePrintText(line.text);
  const attrs: string[] = [`align="${line.align ?? "left"}"`];
  if (line.weight === "emphasis" || line.weight === "double") attrs.push(`em="true"`);
  if (line.weight === "double") {
    attrs.push(`width="2"`);
    attrs.push(`height="2"`);
  }
  if (line.size === "small") attrs.push(`font="font_b"`);
  if (line.role === "note") attrs.push(`ul="true"`);
  return `<text ${attrs.join(" ")}>${body}&#10;</text>`;
}

/**
 * Convert a ticket model into an ePOS-Print XML document. Ends with a feed-and-cut.
 * Stored on the print job row; reprints transmit these bytes unchanged.
 */
export function renderEposPrintXml(ticket: TicketModel): string {
  const body = ticket.lines.map(textElement).join("");
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<epos-print xmlns="${EPOS_NS}">` +
    `<text lang="en"/>` +
    body +
    `<cut type="feed"/>` +
    `</epos-print>`
  );
}

const REPRINT_BANNER =
  `<text align="center" em="true" reverse="true">*** REPRINT ***&#10;</text>`;

/**
 * Prepend a visible reprint banner at send time without mutating the stored payload.
 */
export function withReprintBanner(eposXml: string): string {
  const marker = `<epos-print xmlns="${EPOS_NS}">`;
  const idx = eposXml.indexOf(marker);
  if (idx === -1) return eposXml;
  const insertAt = idx + marker.length;
  return eposXml.slice(0, insertAt) + REPRINT_BANNER + eposXml.slice(insertAt);
}

export function documentHasCut(xml: string): boolean {
  return /<cut\b/i.test(xml);
}
