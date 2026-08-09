// SPRINT-1: typed StoreConfig accessor with short in-process TTL cache and explicit invalidation
import type { StoreConfigData } from "@harolds/types";
import { prisma } from "./client";

const CACHE_TTL_MS = 30_000;

let cache: { value: StoreConfigData; expiresAt: number } | null = null;

function toData(row: {
  id: string;
  storeName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  contactPhone: string;
  timezone: string;
  taxRateBps: number;
  taxAppliedPreDiscount: boolean;
  orderNumberPrefix: string;
  orderNumberStartValue: number;
  normalPrepMinutes: number;
  busyPrepMinutes: number;
  isBusy: boolean;
  tippingEnabled: boolean;
  tipPresetsBps: number[];
  defaultTipPresetIndex: number;
  acceptingOrders: boolean;
  notAcceptingMessage: string | null;
}): StoreConfigData {
  return {
    id: row.id,
    storeName: row.storeName,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    state: row.state,
    postalCode: row.postalCode,
    contactPhone: row.contactPhone,
    timezone: row.timezone,
    taxRateBps: row.taxRateBps,
    taxAppliedPreDiscount: row.taxAppliedPreDiscount,
    orderNumberPrefix: row.orderNumberPrefix,
    orderNumberStartValue: row.orderNumberStartValue,
    normalPrepMinutes: row.normalPrepMinutes,
    busyPrepMinutes: row.busyPrepMinutes,
    isBusy: row.isBusy,
    tippingEnabled: row.tippingEnabled,
    tipPresetsBps: row.tipPresetsBps,
    defaultTipPresetIndex: row.defaultTipPresetIndex,
    acceptingOrders: row.acceptingOrders,
    notAcceptingMessage: row.notAcceptingMessage,
  };
}

/**
 * Returns the singleton store configuration row.
 * Cached in process memory for CACHE_TTL_MS; call invalidateStoreConfigCache after admin updates.
 */
export async function getStoreConfig(): Promise<StoreConfigData> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.value;
  }

  const row = await prisma.storeConfig.findUniqueOrThrow({ where: { id: "default" } });
  const value = toData(row);
  cache = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

/** Clear the in-process store-config cache. Sprint 8 admin panel calls this after mutations. */
export function invalidateStoreConfigCache(): void {
  cache = null;
}

/** Test helper — exposes whether the cache currently holds a value. */
export function __storeConfigCacheIsHot(): boolean {
  return cache !== null && cache.expiresAt > Date.now();
}
