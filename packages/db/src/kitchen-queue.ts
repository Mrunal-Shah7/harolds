// SPRINT-6: kitchen order queue — driven by order status alone, never print-job state.
import { OrderStatus } from "@harolds/types";
import type {
  KitchenQueueLine,
  KitchenQueueModifier,
  KitchenQueueOrder,
  SelectedModifierSnapshot,
} from "@harolds/types";
import { prisma } from "./client";
import type { OrderLine } from "./generated/prisma";

/** Statuses the kitchen still needs to act on. READY stays until picked up. */
export const KITCHEN_QUEUE_STATUSES: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.PRINTED,
  OrderStatus.IN_PROGRESS,
  OrderStatus.READY,
];

function modifiersOf(line: OrderLine): KitchenQueueModifier[] {
  const raw = line.selectedModifiers;
  if (!Array.isArray(raw)) return [];
  return (raw as unknown as SelectedModifierSnapshot[]).map((m) => ({
    groupName: typeof m.groupName === "string" ? m.groupName : "",
    optionName: typeof m.optionName === "string" ? m.optionName : "",
  }));
}

function lastInitial(lastName: string): string {
  const trimmed = lastName.trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase();
}

function toQueueLine(line: OrderLine): KitchenQueueLine {
  return {
    quantity: line.quantity,
    itemName: line.itemName,
    boardLabel: line.boardLabel,
    customerNote: line.customerNote,
    selectedModifiers: modifiersOf(line),
  };
}

export function toKitchenQueueOrder(order: {
  id: string;
  orderNumber: string | null;
  customerFirstName: string;
  customerLastName: string;
  status: string;
  paidAt: Date | null;
  printedAt: Date | null;
  customerNote: string | null;
  lines: OrderLine[];
}): KitchenQueueOrder {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerFirstName: order.customerFirstName,
    customerLastInitial: lastInitial(order.customerLastName),
    status: order.status,
    paidAt: order.paidAt?.toISOString() ?? null,
    printedAt: order.printedAt?.toISOString() ?? null,
    customerNote: order.customerNote,
    lines: [...order.lines]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(toQueueLine),
  };
}

const queueInclude = { lines: true } as const;

export async function listKitchenQueue(): Promise<KitchenQueueOrder[]> {
  const orders = await prisma.order.findMany({
    where: { status: { in: KITCHEN_QUEUE_STATUSES } },
    orderBy: { paidAt: "asc" },
    include: queueInclude,
  });
  return orders.map(toKitchenQueueOrder);
}

export async function getKitchenOrder(orderId: string): Promise<KitchenQueueOrder | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: queueInclude,
  });
  if (!order) return null;
  return toKitchenQueueOrder(order);
}
