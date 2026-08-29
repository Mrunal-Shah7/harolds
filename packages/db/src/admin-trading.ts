// SPRINT-12: trading override CRUD — expires by itself at end of business date by default.
import { DateTime } from "luxon";
import { prisma } from "./client";
import { invalidateStoreConfigCache } from "./store-config";
import { recordAdminAudit } from "./admin-audit";
import { AdminValidationError } from "./admin-menu";
import {
  TradingOverrideKind,
  defaultOverrideExpiry,
  type TradingOverrideKind as OverrideKind,
} from "./trading-state";
import { getStoreConfig } from "./store-config";
import { businessDateToUtcDate } from "./business-date";

const KINDS = new Set<string>(Object.values(TradingOverrideKind));

function dateToIso(d: Date): string {
  return DateTime.fromJSDate(d, { zone: "utc" }).toISODate() ?? d.toISOString().slice(0, 10);
}

export async function listTradingOverrides(args?: { includeExpired?: boolean }) {
  const now = new Date();
  const rows = await prisma.tradingOverride.findMany({
    where: args?.includeExpired
      ? undefined
      : { cancelledAt: null, expiresAt: { gt: now } },
    orderBy: [{ businessDate: "desc" }, { createdAt: "desc" }],
  });
  return rows.map((r) => ({
    ...r,
    businessDate: dateToIso(r.businessDate),
  }));
}

export type CreateTradingOverrideInput = {
  kind: string;
  /** YYYY-MM-DD business date; defaults to today's business date. */
  businessDate?: string;
  openTime?: string | null;
  closeTime?: string | null;
  customerMessage?: string | null;
  /** ISO expiry; defaults to end of the business date. */
  expiresAt?: string | null;
};

export async function createTradingOverride(
  input: CreateTradingOverrideInput,
  userId: string,
) {
  if (!KINDS.has(input.kind)) {
    throw new AdminValidationError(
      "kind must be CLOSE_EARLY | OPEN_LATE | CLOSED_REST_OF_DAY | OPEN_ANYWAY.",
    );
  }
  const kind = input.kind as OverrideKind;
  const config = await getStoreConfig();
  const businessDate =
    input.businessDate?.trim() ||
    DateTime.fromJSDate(new Date(), { zone: "utc" })
      .setZone(config.timezone)
      .toISODate()!;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    throw new AdminValidationError("businessDate must be YYYY-MM-DD.");
  }

  const timeOk = (t: string | null | undefined) =>
    t == null || t === "" || /^\d{2}:\d{2}$/.test(t);

  if (!timeOk(input.openTime) || !timeOk(input.closeTime)) {
    throw new AdminValidationError("Times must be HH:mm.");
  }

  if (kind === TradingOverrideKind.CLOSE_EARLY && !input.closeTime) {
    throw new AdminValidationError("CLOSE_EARLY requires closeTime.");
  }
  if (kind === TradingOverrideKind.OPEN_LATE && !input.openTime) {
    throw new AdminValidationError("OPEN_LATE requires openTime.");
  }
  if (kind === TradingOverrideKind.OPEN_ANYWAY && (!input.openTime || !input.closeTime)) {
    throw new AdminValidationError("OPEN_ANYWAY requires openTime and closeTime.");
  }

  const expiresAt = input.expiresAt
    ? new Date(input.expiresAt)
    : defaultOverrideExpiry(businessDate, config.timezone, config.orderNumberResetHour);
  if (Number.isNaN(expiresAt.getTime())) {
    throw new AdminValidationError("expiresAt must be a valid ISO timestamp.");
  }

  const row = await prisma.tradingOverride.create({
    data: {
      businessDate: businessDateToUtcDate(businessDate),
      kind,
      openTime: input.openTime?.trim() || null,
      closeTime: input.closeTime?.trim() || null,
      customerMessage: input.customerMessage?.trim().slice(0, 280) || null,
      expiresAt,
      createdById: userId,
    },
  });
  invalidateStoreConfigCache();
  await recordAdminAudit({
    userId,
    action: "TRADING_OVERRIDE_CREATE",
    entityType: "TradingOverride",
    entityId: row.id,
    summary: `Created ${kind} override for ${businessDate}`,
    details: { before: null, after: { kind, businessDate, expiresAt: expiresAt.toISOString() } },
  });
  return { ...row, businessDate };
}

export async function cancelTradingOverride(id: string, userId: string) {
  const before = await prisma.tradingOverride.findUnique({ where: { id } });
  if (!before) throw new AdminValidationError("Override not found.");
  if (before.cancelledAt) return { ...before, businessDate: dateToIso(before.businessDate) };

  const row = await prisma.tradingOverride.update({
    where: { id },
    data: { cancelledAt: new Date() },
  });
  invalidateStoreConfigCache();
  await recordAdminAudit({
    userId,
    action: "TRADING_OVERRIDE_CANCEL",
    entityType: "TradingOverride",
    entityId: id,
    summary: `Cancelled ${before.kind} override`,
    details: {
      before: { cancelledAt: null, kind: before.kind },
      after: { cancelledAt: row.cancelledAt?.toISOString() },
    },
  });
  return { ...row, businessDate: dateToIso(row.businessDate) };
}
