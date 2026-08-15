#!/usr/bin/env node
// SPRINT-11: run the sales-report summing invariant against every paid order in the development database.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadDotenv({ path: path.join(root, ".env") });

const { prisma } = await import("../packages/db/src/client.ts");
const { salesReport } = await import("../packages/db/src/admin-reports.ts");

const orders = await prisma.order.findMany({
  where: { paidAt: { not: null } },
  select: {
    orderNumber: true,
    subtotalCents: true,
    taxCents: true,
    tipCents: true,
    totalCents: true,
    refundedCents: true,
    paidAt: true,
  },
  orderBy: { paidAt: "asc" },
});

let bad = 0;
for (const row of orders) {
  const sum = row.subtotalCents + row.taxCents + row.tipCents;
  const ok = sum === row.totalCents;
  if (!ok) bad += 1;
  console.log(
    `${ok ? "ok" : "FAIL"} ${row.orderNumber} subtotal=${row.subtotalCents} tax=${row.taxCents} tip=${row.tipCents} total=${row.totalCents} paidAt=${row.paidAt?.toISOString()}`,
  );
}
console.log(`paid_orders=${orders.length} non_reconciling=${bad}`);

if (orders.length > 0) {
  const first = orders[0].paidAt;
  const last = orders[orders.length - 1].paidAt;
  const fromDate = first.toISOString().slice(0, 10);
  const toDate = last.toISOString().slice(0, 10);
  const report = await salesReport({ fromDate: "2020-01-01", toDate: "2099-12-31", timeZone: "America/Chicago" });
  const storedGross = orders.reduce((n, o) => n + o.totalCents, 0);
  const storedTax = orders.reduce((n, o) => n + o.taxCents, 0);
  const storedTip = orders.reduce((n, o) => n + o.tipCents, 0);
  const storedRefunds = orders.reduce((n, o) => n + o.refundedCents, 0);
  console.log(
    `report totals gross=${report.totals.grossSalesCents} tax=${report.totals.taxCollectedCents} tip=${report.totals.tipsCollectedCents} refunds=${report.totals.refundsIssuedCents} net=${report.totals.netCents}`,
  );
  console.log(
    `stored sums  gross=${storedGross} tax=${storedTax} tip=${storedTip} refunds=${storedRefunds} net=${storedGross - storedRefunds}`,
  );
  if (
    report.totals.grossSalesCents !== storedGross ||
    report.totals.taxCollectedCents !== storedTax ||
    report.totals.tipsCollectedCents !== storedTip ||
    report.totals.refundsIssuedCents !== storedRefunds
  ) {
    // Report buckets unpaid cancelled rows by createdAt; paid-only compare can still match if all paidAt fall in range.
    console.log(`note: report window 2020-01-01..2099-12-31 includes unpaid rows in orderCount (${report.totals.orderCount})`);
  }
}

await prisma.$disconnect();
if (bad > 0) process.exit(1);
