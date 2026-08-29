// SPRINT-2 / SPRINT-12: read-only store status — schedule, overrides, switch, messaging.
import { DateTime } from "luxon";
import type { StoreStatus } from "@harolds/types";
import { prisma } from "../client";
import { evaluateTradingState, type TradingOverrideKind } from "../trading-state";
import { mapStoreStatus } from "../mappers/store";
import { getStoreConfig } from "../store-config";

/** Format a Prisma `@db.Date` value as YYYY-MM-DD in UTC. */
function dateToIsoDate(d: Date): string {
  return DateTime.fromJSDate(d, { zone: "utc" }).toISODate() ?? d.toISOString().slice(0, 10);
}

/**
 * Public store status at `instant` (defaults to now).
 * Omits order-number prefix/pad/reset and manager alert contacts.
 */
export async function getStoreStatus(instant: Date = new Date()): Promise<StoreStatus> {
  const [config, hoursRows, closureRows, overrideRows] = await Promise.all([
    getStoreConfig(),
    prisma.storeHours.findMany({ orderBy: { dayOfWeek: "asc" } }),
    prisma.storeClosure.findMany({ orderBy: { date: "asc" } }),
    prisma.tradingOverride.findMany({
      where: { cancelledAt: null, expiresAt: { gt: instant } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const hours = hoursRows.map((h) => ({
    dayOfWeek: h.dayOfWeek,
    openTime: h.openTime,
    closeTime: h.closeTime,
    isClosed: h.isClosed,
  }));

  const closures = closureRows.map((c) => ({
    date: dateToIsoDate(c.date),
    reason: c.reason,
  }));

  const overrides = overrideRows.map((o) => ({
    id: o.id,
    businessDate: dateToIsoDate(o.businessDate),
    kind: o.kind as TradingOverrideKind,
    openTime: o.openTime,
    closeTime: o.closeTime,
    customerMessage: o.customerMessage,
    expiresAt: o.expiresAt,
    cancelledAt: o.cancelledAt,
  }));

  const trading = evaluateTradingState({
    instant,
    timeZone: config.timezone,
    orderNumberResetHour: config.orderNumberResetHour,
    acceptingOrders: config.acceptingOrders,
    hours,
    closures,
    overrides,
  });

  const prepMinutes = config.isBusy ? config.busyPrepMinutes : config.normalPrepMinutes;

  return mapStoreStatus({
    config,
    hours,
    closures,
    isOpen: trading.isOpen,
    nextOpenAt: trading.nextOpenAt,
    closedReason: trading.closedReason,
    activeOverride: trading.activeOverride,
    instant,
    prepMinutes,
  });
}
