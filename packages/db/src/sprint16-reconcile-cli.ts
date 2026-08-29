// SPRINT-16 Phase 6: the reconciliation report the OPERATOR runs against production.
//
// READ-ONLY BY CONSTRUCTION, not by intention. Every query runs inside a transaction that begins
// with `SET TRANSACTION READ ONLY`, so Postgres itself rejects any write this process attempts —
// including one added by mistake later. There is no update, delete, or refund path in this file.
//
// Two reports over ONE pass, because both cover the same orders in the same window:
//
//   1. TIP EXPOSURE — every order with a non-zero tip since cutover. Before Sprint 14 the
//      checkout quote effect depended on [lines.length] only, so choosing a tip never re-quoted:
//      the customer saw a total EXCLUDING their tip and was charged one INCLUDING it. The
//      discrepancy per order is therefore exactly the tip. The SMS and email receipts were
//      correct, so the first sight of the real figure was after the card was charged.
//
//   2. DUPLICATE CHECK — orders grouped by phone where two or more fall inside a short interval
//      with the same cart signature. Output carries enough to look each pair up in Square and
//      confirm whether two captures actually exist.
//
// Usage:
//   pnpm reconcile:sprint16 -- --since 2026-08-01 [--window 180] [--out ./report]
//
// Writes two CSV files (or prints to stdout with --stdout) for work in a spreadsheet — the
// operator has to reason about this list, not read it in a terminal.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "./client";

type Args = { since: Date; windowSeconds: number; out: string | null; stdout: boolean };

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const sinceRaw = get("--since");
  if (!sinceRaw) {
    throw new Error("--since <YYYY-MM-DD> is required (the cutover date).");
  }
  const since = new Date(`${sinceRaw}T00:00:00.000Z`);
  if (Number.isNaN(since.getTime())) throw new Error(`--since is not a date: ${sinceRaw}`);

  const windowSeconds = Number.parseInt(get("--window") ?? "180", 10);
  if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) {
    throw new Error("--window must be a positive number of seconds.");
  }
  return {
    since,
    windowSeconds,
    out: get("--out") ?? null,
    stdout: argv.includes("--stdout"),
  };
}

function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n");
}

function money(cents: number): string {
  return (cents / 100).toFixed(2);
}

export type ReconcileReports = {
  tipRows: unknown[][];
  duplicateRows: unknown[][];
  summary: {
    tippedOrderCount: number;
    tipTotalCents: number;
    tipFirstAt: string | null;
    tipLastAt: string | null;
    duplicatePairCount: number;
    duplicateChargedTotalCents: number;
  };
};

/**
 * Build both reports in one read-only pass. Exported so it can be tested against seeded data
 * without going near a CLI.
 */
export async function buildReconcileReports(args: {
  since: Date;
  windowSeconds: number;
}): Promise<ReconcileReports> {
  return prisma.$transaction(async (tx) => {
    // Postgres enforces the read-only promise for everything below.
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");

    const orders = await tx.order.findMany({
      where: { createdAt: { gte: args.since } },
      orderBy: [{ customerPhone: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        paidAt: true,
        customerPhone: true,
        customerEmail: true,
        subtotalCents: true,
        taxCents: true,
        tipCents: true,
        totalCents: true,
        refundedCents: true,
        paymentStatus: true,
        status: true,
        processorPaymentId: true,
        cartFingerprint: true,
      },
    });

    // ---- 1. Tip exposure -------------------------------------------------
    const tipped = orders.filter((o) => o.tipCents > 0);
    const tipRows = tipped.map((o) => [
      o.orderNumber ?? o.id,
      o.createdAt.toISOString(),
      o.paidAt?.toISOString() ?? "",
      o.customerPhone,
      o.customerEmail,
      money(o.subtotalCents),
      money(o.taxCents),
      // What the customer saw before Sprint 14: the quote WITHOUT their tip.
      money(o.totalCents - o.tipCents),
      money(o.tipCents),
      // What they were actually charged.
      money(o.totalCents),
      // The discrepancy is exactly the tip.
      money(o.tipCents),
      o.paymentStatus,
      o.status,
      money(o.refundedCents),
      o.processorPaymentId ?? "",
    ]);

    // ---- 2. Duplicate check ---------------------------------------------
    const windowMs = args.windowSeconds * 1000;
    const byPhone = new Map<string, typeof orders>();
    for (const o of orders) {
      const list = byPhone.get(o.customerPhone) ?? [];
      list.push(o);
      byPhone.set(o.customerPhone, list);
    }

    const duplicateRows: unknown[][] = [];
    let duplicateChargedTotalCents = 0;
    for (const [phone, list] of byPhone) {
      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          const a = list[i]!;
          const b = list[j]!;
          if (a.cartFingerprint !== b.cartFingerprint) continue;
          const gapMs = b.createdAt.getTime() - a.createdAt.getTime();
          if (gapMs > windowMs) break; // sorted by createdAt — nothing later is closer
          duplicateChargedTotalCents += b.totalCents;
          duplicateRows.push([
            phone,
            Math.round(gapMs / 1000),
            a.orderNumber ?? a.id,
            a.createdAt.toISOString(),
            money(a.totalCents),
            a.paymentStatus,
            a.processorPaymentId ?? "",
            money(a.refundedCents),
            b.orderNumber ?? b.id,
            b.createdAt.toISOString(),
            money(b.totalCents),
            b.paymentStatus,
            b.processorPaymentId ?? "",
            money(b.refundedCents),
            a.cartFingerprint.slice(0, 16),
          ]);
        }
      }
    }

    return {
      tipRows,
      duplicateRows,
      summary: {
        tippedOrderCount: tipped.length,
        tipTotalCents: tipped.reduce((sum, o) => sum + o.tipCents, 0),
        tipFirstAt: tipped[0]?.createdAt.toISOString() ?? null,
        tipLastAt: tipped[tipped.length - 1]?.createdAt.toISOString() ?? null,
        duplicatePairCount: duplicateRows.length,
        duplicateChargedTotalCents,
      },
    };
  });
}

const TIP_HEADERS = [
  "order_number",
  "created_at",
  "paid_at",
  "phone",
  "email",
  "subtotal",
  "tax",
  "displayed_total_before_sprint14",
  "tip",
  "charged_total",
  "discrepancy",
  "payment_status",
  "order_status",
  "refunded",
  "processor_payment_id",
];

const DUP_HEADERS = [
  "phone",
  "gap_seconds",
  "first_order",
  "first_created_at",
  "first_total",
  "first_payment_status",
  "first_payment_id",
  "first_refunded",
  "second_order",
  "second_created_at",
  "second_total",
  "second_payment_status",
  "second_payment_id",
  "second_refunded",
  "cart_signature",
];

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const reports = await buildReconcileReports(args);

  const tipCsv = toCsv(TIP_HEADERS, reports.tipRows);
  const dupCsv = toCsv(DUP_HEADERS, reports.duplicateRows);

  console.log("SPRINT-16 reconciliation (read-only)");
  console.log(`  since:            ${args.since.toISOString()}`);
  console.log(`  duplicate window: ${args.windowSeconds}s`);
  console.log("");
  console.log("TIP EXPOSURE");
  console.log(`  tipped orders:    ${reports.summary.tippedOrderCount}`);
  console.log(`  total tip value:  $${money(reports.summary.tipTotalCents)}`);
  console.log(`  date range:       ${reports.summary.tipFirstAt ?? "-"} .. ${reports.summary.tipLastAt ?? "-"}`);
  console.log("");
  console.log("DUPLICATE CHARGES (candidates — confirm each in Square before refunding)");
  console.log(`  candidate pairs:  ${reports.summary.duplicatePairCount}`);
  console.log(`  second-charge value: $${money(reports.summary.duplicateChargedTotalCents)}`);
  console.log("");

  if (args.stdout || !args.out) {
    console.log("--- tips.csv ---");
    console.log(tipCsv);
    console.log("");
    console.log("--- duplicates.csv ---");
    console.log(dupCsv);
    return;
  }

  const tipPath = path.resolve(`${args.out}-tips.csv`);
  const dupPath = path.resolve(`${args.out}-duplicates.csv`);
  writeFileSync(tipPath, `${tipCsv}\n`, "utf8");
  writeFileSync(dupPath, `${dupCsv}\n`, "utf8");
  console.log(`Wrote ${tipPath}`);
  console.log(`Wrote ${dupPath}`);
}

// Only run when invoked as a CLI, so the report builder can be imported by tests.
if (process.argv[1] && process.argv[1].includes("sprint16-reconcile-cli")) {
  main()
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
