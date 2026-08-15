// SPRINT-2: StoreConfig + hours + closures + open/closed → StoreStatus contract.
import type { StoreConfigData, StoreStatus } from "@harolds/types";
import type { OpenClosedResult } from "../open-closed";

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
  openClosed: OpenClosedResult;
  /** Evaluation instant used for estimatedReadyAt */
  instant: Date;
  prepMinutes: number;
};

export function mapStoreStatus(args: MapStoreStatusArgs): StoreStatus {
  const { config, hours, closures, openClosed, instant, prepMinutes } = args;
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
    isOpen: openClosed.isOpen,
    nextOpenAt: openClosed.nextOpenAt ? openClosed.nextOpenAt.toISOString() : null,
    acceptingOrders: config.acceptingOrders,
    notAcceptingMessage: config.notAcceptingMessage,
    prepMinutes,
    estimatedReadyAt: estimatedReadyAt.toISOString(),
    taxRateBps: config.taxRateBps,
    taxAppliedPreDiscount: config.taxAppliedPreDiscount,
    tippingEnabled: config.tippingEnabled,
    tipPresetsBps: [...config.tipPresetsBps],
    defaultTipPresetIndex: config.defaultTipPresetIndex,
  };
}
