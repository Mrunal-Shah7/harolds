// SPRINT-4: orphan detection CLI — reports Square/DB discrepancies (read-only by default).
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import { prisma } from "./client";
import { runReconciliation, sweepAbandonedOrders } from "./reconcile";
import { getPayment } from "@harolds/square";

function parseArgs(argv: string[]) {
  const out = { hours: 24, alerts: false, sweep: false, sweepMinutes: 60 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--hours") out.hours = Number(argv[++i]);
    if (a === "--alerts") out.alerts = true;
    if (a === "--sweep") out.sweep = true;
    if (a === "--sweep-minutes") out.sweepMinutes = Number(argv[++i]);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const until = new Date();
const since = new Date(until.getTime() - args.hours * 3600_000);

console.log(`Harold's reconciliation — window ${since.toISOString()} → ${until.toISOString()}`);

const findings = await runReconciliation({
  since,
  until,
  enqueueAlerts: args.alerts,
  probePayment: async (paymentId) => {
    const p = await getPayment(paymentId);
    return p ? { status: p.status, amountCents: p.amountCents } : null;
  },
});

if (findings.length === 0) {
  console.log("No findings.");
} else {
  for (const f of findings) {
    console.log(
      [
        f.kind,
        `order=${f.orderId ?? "-"}`,
        `payment=${f.processorPaymentId ?? "-"}`,
        `orderCents=${f.orderTotalCents ?? "-"}`,
        `squareCents=${f.squareAmountCents ?? "-"}`,
        f.detail,
      ].join(" | "),
    );
  }
  console.log(`Total findings: ${findings.length}`);
}

if (args.sweep) {
  const n = await sweepAbandonedOrders(args.sweepMinutes);
  console.log(`Swept ${n} payment-less stale order(s) to ABANDONED (>${args.sweepMinutes}m).`);
}

await prisma.$disconnect();
