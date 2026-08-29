// SPRINT-2 / SPRINT-12: StoreConfig + hours + closures + trading overrides → StoreStatus.
import type { StoreConfigData, StoreStatus } from "@harolds/types";
import type { TradingClosedReason, TradingOverrideRow } from "../trading-state";

export type StoreHoursInput = {
  dayOfWeek: number;
  openTime: string | null;
  closeTime: string | null;
  isClosed: boolean;
};

export type StoreClosureInput = {
  date: string;
  reason: string | null;
};

export type MapStoreStatusArgs = {
  config: StoreConfigData;
  hours: StoreHoursInput[];
  closures: StoreClosureInput[];
  isOpen: boolean;
  nextOpenAt: Date | null;
  closedReason: TradingClosedReason;
  activeOverride: TradingOverrideRow | null;
  /** Evaluation instant used for estimatedReadyAt and announcement window */
  instant: Date;
  prepMinutes: number;
};

const ANNOUNCEMENT_MAX = 280;

export function resolveAnnouncement(
  config: StoreConfigData,
  instant: Date,
): string | null {
  const text = config.announcementText?.trim() ?? "";
  if (!text) return null;
  const clipped = text.slice(0, ANNOUNCEMENT_MAX);
  const start = config.announcementStartsAt;
  const end = config.announcementEndsAt;
  if (start && instant.getTime() < start.getTime()) return null;
  if (end && instant.getTime() >= end.getTime()) return null;
  return clipped;
}

export function mapStoreStatus(args: MapStoreStatusArgs): StoreStatus {
  const { config, hours, closures, isOpen, nextOpenAt, closedReason, instant, prepMinutes } = args;
  const estimatedReadyAt = new Date(instant.getTime() + prepMinutes * 60_000);

  return {
    storeName: config.storeName,
    addressLine1: config.addressLine1,
    addressLine2: config.addressLine2,
    city: config.city,
    state: config.state,
    postalCode: config.postalCode,
    contactPhone: config.contactPhone,
    timezone: config.timezone,
    hours: hours.map((h) => ({
      dayOfWeek: h.dayOfWeek,
      openTime: h.openTime,
      closeTime: h.closeTime,
      isClosed: h.isClosed,
    })),
    closures: closures.map((c) => ({
      date: c.date,
      reason: c.reason,
    })),
    isOpen,
    nextOpenAt: nextOpenAt ? nextOpenAt.toISOString() : null,
    acceptingOrders: config.acceptingOrders,
    notAcceptingMessage: config.notAcceptingMessage,
    prepMinutes,
    estimatedReadyAt: estimatedReadyAt.toISOString(),
    taxRateBps: config.taxRateBps,
    taxAppliedPreDiscount: config.taxAppliedPreDiscount,
    tippingEnabled: config.tippingEnabled,
    tipPresetsBps: [...config.tipPresetsBps],
    defaultTipPresetIndex: config.defaultTipPresetIndex,
    closedReason,
    closedMessage: config.closedMessage,
    prepEstimatePhrase: config.prepEstimatePhrase ?? "about {minutes} min",
    announcement: resolveAnnouncement(config, instant),
  };
}
