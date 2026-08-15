// SPRINT-11: scheduled reconciliation — one pass per business date; records findings; repairs nothing.
import { DateTime } from "luxon";
import { JobStatus, JobType } from "@harolds/types";
import { prisma } from "./client";
import { getStoreConfig } from "./store-config";
import { businessDateToUtcDate, resolveBusinessDate } from "./business-date";
import { runReconciliation, type ReconcileFinding, type SquarePaymentProbe } from "./reconcile";

export type ScheduledReconcileSkip = "too_early" | "already_ran";

export type ScheduledReconcileResult = {
  skipped: ScheduledReconcileSkip | false;
  businessDate: string;
  findingCount: number;
  findings: ReconcileFinding[];
  runId: string | null;
};

export async function getLatestReconciliationRun(): Promise<{
  businessDate: string;
  ranAt: string;
  findingCount: number;
  findings: ReconcileFinding[];
} | null> {
  const row = await prisma.reconciliationRun.findFirst({ orderBy: { ranAt: "desc" } });
  if (!row) return null;
  const date =
    DateTime.fromJSDate(row.businessDate, { zone: "utc" }).toISODate() ??
    row.businessDate.toISOString().slice(0, 10);
  return {
    businessDate: date,
    ranAt: row.ranAt.toISOString(),
    findingCount: row.findingCount,
    findings: row.findings as ReconcileFinding[],
  };
}

/**
 * Run today's reconciliation if the store-local hour has been reached and this
 * business date has no recorded pass yet. Writes only ReconciliationRun + alert jobs.
 */
export async function maybeRunScheduledReconciliation(args: {
  now?: Date;
  hourLocal: number;
  lookbackHours: number;
  probePayment: (paymentId: string) => Promise<SquarePaymentProbe | null>;
  enqueueAlerts?: boolean;
}): Promise<ScheduledReconcileResult> {
  const now = args.now ?? new Date();
  const store = await getStoreConfig();
  const businessDate = resolveBusinessDate(now, store.timezone, store.orderNumberResetHour);
  const local = DateTime.fromJSDate(now, { zone: "utc" }).setZone(store.timezone);
  const empty: ScheduledReconcileResult = {
    skipped: false,
    businessDate,
    findingCount: 0,
    findings: [],
    runId: null,
  };

  if (local.hour < args.hourLocal) {
    return { ...empty, skipped: "too_early" };
  }

  const dateKey = businessDateToUtcDate(businessDate);
  const existing = await prisma.reconciliationRun.findUnique({ where: { businessDate: dateKey } });
  if (existing) {
    return {
      skipped: "already_ran",
      businessDate,
      findingCount: existing.findingCount,
      findings: existing.findings as ReconcileFinding[],
      runId: existing.id,
    };
  }

  const since = new Date(now.getTime() - args.lookbackHours * 3600_000);
  const findings = await runReconciliation({
    since,
    until: now,
    enqueueAlerts: false,
    probePayment: args.probePayment,
  });

  if ((args.enqueueAlerts ?? true) && findings.length > 0) {
    await prisma.backgroundJob.create({
      data: {
        type: JobType.ALERT_MANAGER_PAYMENT_DISCREPANCY,
        status: JobStatus.PENDING,
        payload: {
          businessDate,
          findingCount: findings.length,
          orderId: findings[0]?.orderId ?? null,
          findings,
        },
      },
    });
  }

  try {
    const created = await prisma.reconciliationRun.create({
      data: {
        businessDate: dateKey,
        ranAt: now,
        findingCount: findings.length,
        findings: findings as object[],
      },
    });
    return {
      skipped: false,
      businessDate,
      findingCount: findings.length,
      findings,
      runId: created.id,
    };
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "P2002") {
      const raced = await prisma.reconciliationRun.findUnique({ where: { businessDate: dateKey } });
      return {
        skipped: "already_ran",
        businessDate,
        findingCount: raced?.findingCount ?? findings.length,
        findings: (raced?.findings as ReconcileFinding[]) ?? findings,
        runId: raced?.id ?? null,
      };
    }
    throw err;
  }
}
