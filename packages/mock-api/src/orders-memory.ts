// SPRINT-4: in-memory mock orders — no DB, no Square; status lookup works for process lifetime
import { randomBytes } from "node:crypto";
import type { CheckoutOrderResponse, PublicOrderStatusResponse } from "@harolds/types";

const ordersByIdempotency = new Map<string, CheckoutOrderResponse>();
const ordersByToken = new Map<string, CheckoutOrderResponse>();

let seq = 0;

export function mockGenerateLookupToken(): string {
  return randomBytes(24).toString("hex");
}

export function mockFindByIdempotency(key: string): CheckoutOrderResponse | undefined {
  return ordersByIdempotency.get(key);
}

export function mockFindByToken(token: string): CheckoutOrderResponse | undefined {
  return ordersByToken.get(token);
}

export function mockStoreOrder(order: CheckoutOrderResponse, idempotencyKey: string): void {
  ordersByIdempotency.set(idempotencyKey, order);
  ordersByToken.set(order.lookupToken, order);
}

export function mockNextOrderNumber(): string {
  seq += 1;
  return `HC-${String(seq).padStart(3, "0")}`;
}

export function toPublicStatus(order: CheckoutOrderResponse): PublicOrderStatusResponse {
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    firstName: "Guest",
    subtotalCents: order.subtotalCents,
    taxCents: order.taxCents,
    tipCents: order.tipCents,
    totalCents: order.totalCents,
    estimatedReadyAt: order.estimatedReadyAt,
    lines: order.lines.map((l) => ({
      itemName: l.itemName,
      boardLabel: l.boardLabel,
      quantity: l.quantity,
      effectiveUnitPriceCents: l.effectiveUnitPriceCents,
      lineTotalCents: l.lineTotalCents,
      selectedModifiers: l.selectedModifiers,
    })),
  };
}
