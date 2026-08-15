// SPRINT-8: sales reporting from stored order cents — never recomputes tax or tips.
import { DateTime } from "luxon";
import { prisma } from "./client";
import { OrderStatus } from "@harolds/types";

export type SalesDayRow = {
  date: string;
  orderCount: number;
  countsByStatus: Record<string, number>;
  grossSalesCents: number;
  taxCollectedCents: number;
  tipsCollectedCents: number;
  refundsIssuedCents: number;
  netCents: number;
};

export type ItemSalesRow = {
  itemName: string;
  quantity: number;
  lineTotalCents: number;
};

export type SalesReport = {
  from: string;
  to: string;
  timezone: string;
  totals: Omit<SalesDayRow, "date">;
  days: SalesDayRow[];
  items: ItemSalesRow[];
};

function emptyCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const status of Object.values(OrderStatus)) {
    counts[status] = 0;
  }
  return counts;
}

function emptyDay(date: string): SalesDayRow {
  return {
    date,
    orderCount: 0,
    countsByStatus: emptyCounts(),
    grossSalesCents: 0,
    taxCollectedCents: 0,
    tipsCollectedCents: 0,
    refundsIssuedCents: 0,
    netCents: 0,
  };
}

/**
 * Inclusive store-local calendar dates. Paid money is attributed on paidAt's
 * store-local date; unpaid cancelled/abandoned orders on createdAt so they
 * remain visible rather than disappearing from the report.
 */
export async function salesReport(args: {
  fromDate: string;
  toDate: string;
  timeZone: string;
}): Promise<SalesReport> {
  const zone = args.timeZone;
  const from = DateTime.fromISO(args.fromDate, { zone }).startOf("day");
  const to = DateTime.fromISO(args.toDate, { zone }).startOf("day").plus({ days: 1 });
  if (!from.isValid || !to.isValid || to <= from) {
    throw new Error("Invalid date range.");
  }

  const fromUtc = from.toUTC().toJSDate();
  const toUtc = to.toUTC().toJSDate();

  const orders = await prisma.order.findMany({
    where: {
      OR: [{ paidAt: { gte: fromUtc, lt: toUtc } }, { paidAt: null, createdAt: { gte: fromUtc, lt: toUtc } }],
    },
    select: {
      id: true,
      status: true,
      paidAt: true,
      createdAt: true,
      totalCents: true,
      taxCents: true,
      tipCents: true,
      refundedCents: true,
      lines: { select: { itemName: true, quantity: true, lineTotalCents: true } },
    },
  });

  const byDay = new Map<string, SalesDayRow>();
  let cursor = from;
  while (cursor < to) {
    const key = cursor.toISODate() ?? "";
    byDay.set(key, emptyDay(key));
    cursor = cursor.plus({ days: 1 });
  }

  const itemMap = new Map<string, ItemSalesRow>();

  for (const order of orders) {
    const instant = order.paidAt ?? order.createdAt;
    const date = DateTime.fromJSDate(instant, { zone: "utc" }).setZone(zone).toISODate();
    if (!date || !byDay.has(date)) continue;
    const day = byDay.get(date)!;
    day.orderCount += 1;
    day.countsByStatus[order.status] = (day.countsByStatus[order.status] ?? 0) + 1;
    if (order.paidAt) {
      day.grossSalesCents += order.totalCents;
      day.taxCollectedCents += order.taxCents;
      day.tipsCollectedCents += order.tipCents;
      day.refundsIssuedCents += order.refundedCents;
      day.netCents += order.totalCents - order.refundedCents;
      for (const line of order.lines) {
        const prev = itemMap.get(line.itemName) ?? { itemName: line.itemName, quantity: 0, lineTotalCents: 0 };
        prev.quantity += line.quantity;
        prev.lineTotalCents += line.lineTotalCents;
        itemMap.set(line.itemName, prev);
      }
    }
  }

  const days = [...byDay.values()];
  const totals = days.reduce<Omit<SalesDayRow, "date">>(
    (acc, day) => {
      acc.orderCount += day.orderCount;
      for (const [status, count] of Object.entries(day.countsByStatus)) {
        acc.countsByStatus[status] = (acc.countsByStatus[status] ?? 0) + count;
      }
      acc.grossSalesCents += day.grossSalesCents;
      acc.taxCollectedCents += day.taxCollectedCents;
      acc.tipsCollectedCents += day.tipsCollectedCents;
      acc.refundsIssuedCents += day.refundsIssuedCents;
      acc.netCents += day.netCents;
      return acc;
    },
    {
      orderCount: 0,
      countsByStatus: emptyCounts(),
      grossSalesCents: 0,
      taxCollectedCents: 0,
      tipsCollectedCents: 0,
      refundsIssuedCents: 0,
      netCents: 0,
    },
  );

  const items = [...itemMap.values()].sort((a, b) => b.quantity - a.quantity || a.itemName.localeCompare(b.itemName));

  return {
    from: args.fromDate,
    to: args.toDate,
    timezone: zone,
    totals,
    days,
    items,
  };
}

export function salesReportToCsv(report: SalesReport): string {
  const header = [
    "date",
    "order_count",
    "gross_sales_cents",
    "tax_collected_cents",
    "tips_collected_cents",
    "refunds_issued_cents",
    "net_cents",
  ];
  const lines = [header.join(",")];
  for (const day of report.days) {
    lines.push(
      [
        day.date,
        day.orderCount,
        day.grossSalesCents,
        day.taxCollectedCents,
        day.tipsCollectedCents,
        day.refundsIssuedCents,
        day.netCents,
      ].join(","),
    );
  }
  lines.push("");
  lines.push("item_name,quantity,line_total_cents");
  for (const item of report.items) {
    const safe = `"${item.itemName.replace(/"/g, '""')}"`;
    lines.push(`${safe},${item.quantity},${item.lineTotalCents}`);
  }
  return `${lines.join("\n")}\n`;
}
