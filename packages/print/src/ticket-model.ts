// SPRINT-5: ticket content model — what a ticket says, not how the printer encodes it.
// Layout tests and staff feedback change this file; ePOS-Print XML lives elsewhere.

export type TicketAlign = "left" | "center" | "right";
export type TicketWeight = "normal" | "emphasis" | "double";
export type TicketSize = "normal" | "small";
export type TicketRole = "item" | "modifier" | "note" | "rule" | "money" | "header" | "footer" | "emphasis";

export type TicketLine = {
  text: string;
  align?: TicketAlign;
  weight?: TicketWeight;
  size?: TicketSize;
  role?: TicketRole;
};

export type TicketKind = "kitchen" | "counter";

/**
 * Protocol-free ticket. Renderers (plain text, ePOS-Print XML) consume this and nothing else.
 */
export type TicketModel = {
  kind: TicketKind;
  orderNumber: string;
  lines: TicketLine[];
};

/** Order snapshot the layout may read. Never a live menu join. */
export type TicketModifierInput = {
  optionName: string;
};

export type TicketLineInput = {
  quantity: number;
  itemName: string;
  boardLabel: string | null;
  customerNote: string | null;
  selectedModifiers: TicketModifierInput[];
};

export type TicketOrderInput = {
  orderNumber: string;
  /** Instant used in the header — frozen at first render, never "now" on reprint. */
  paidAt: Date;
  timeZone: string;
  storeName: string;
  customerFirstName: string;
  customerLastName: string;
  paymentStatus: string;
  /** Last four of the card, only when the processor supplied them. */
  cardLast4: string | null;
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
  lines: TicketLineInput[];
};

/** 80mm Font A usable columns on the TM-m30III (conservative). */
export const TICKET_COLUMNS = 42;
