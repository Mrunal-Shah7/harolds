// SPRINT-2: read-only store status repository — config + hours + closures + open/closed.
import { DateTime } from "luxon";
import type { StoreStatus } from "@harolds/types";
import { prisma } from "../client";
import { evaluateOpenClosed } from "../open-closed";
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
  const [config, hoursRows, closureRows] = await Promise.all([
    getStoreConfig(),
    prisma.storeHours.findMany({ orderBy: { dayOfWeek: "asc" } }),
    prisma.storeClosure.findMany({ orderBy: { date: "asc" } }),
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

  const openClosed = evaluateOpenClosed({
    instant,
    timeZone: config.timezone,
    hours,
    closures,
  });

  const prepMinutes = config.isBusy ? config.busyPrepMinutes : config.normalPrepMinutes;

  return mapStoreStatus({
    config,
    hours,
    closures,
    openClosed,
    instant,
    prepMinutes,
  });
}
