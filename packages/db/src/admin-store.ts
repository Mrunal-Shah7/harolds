// SPRINT-8: store configuration, hours, and closures — invalidates Sprint 2 public caches.
import { AdminRole } from "@harolds/types";
import { prisma } from "./client";
import { invalidateAllPublicCaches } from "./menu-cache";
import { invalidateStoreConfigCache } from "./store-config";
import { recordAdminAudit } from "./admin-audit";
import { AdminForbiddenError } from "./admin-auth";
import { AdminValidationError } from "./admin-menu";

const OWNER_ONLY_FIELDS = new Set([
  "taxRateBps",
  "taxAppliedPreDiscount",
  "tippingEnabled",
  "tipPresetsBps",
  "defaultTipPresetIndex",
]);

export type StoreConfigPatch = {
  storeName?: string;
  addressLine1?: string;
  addressLine2?: string | null;
  city?: string;
  state?: string;
  postalCode?: string;
  contactPhone?: string;
  timezone?: string;
  taxRateBps?: number;
  taxAppliedPreDiscount?: boolean;
  orderNumberPrefix?: string;
  orderNumberStartValue?: number;
  orderNumberResetHour?: number;
  orderNumberPadWidth?: number;
  normalPrepMinutes?: number;
  busyPrepMinutes?: number;
  isBusy?: boolean;
  tippingEnabled?: boolean;
  tipPresetsBps?: number[];
  defaultTipPresetIndex?: number;
  acceptingOrders?: boolean;
  notAcceptingMessage?: string | null;
  managerAlertPhone?: string | null;
  managerAlertEmail?: string | null;
};

export async function updateStoreConfig(patch: StoreConfigPatch, actor: { userId: string; role: string }) {
  const keys = Object.keys(patch) as (keyof StoreConfigPatch)[];
  const ownerField = keys.find((k) => OWNER_ONLY_FIELDS.has(k));
  if (ownerField && actor.role !== AdminRole.OWNER) {
    throw new AdminForbiddenError("Only the owner can change tax or tip settings.");
  }

  if (patch.taxRateBps !== undefined) {
    if (!Number.isInteger(patch.taxRateBps) || patch.taxRateBps < 0 || patch.taxRateBps > 20_000) {
      throw new AdminValidationError("Tax rate must be between 0 and 20000 basis points.");
    }
  }
  if (patch.orderNumberResetHour !== undefined) {
    if (!Number.isInteger(patch.orderNumberResetHour) || patch.orderNumberResetHour < 0 || patch.orderNumberResetHour > 23) {
      throw new AdminValidationError("Reset hour must be 0–23.");
    }
  }
  if (patch.tipPresetsBps !== undefined) {
    if (!Array.isArray(patch.tipPresetsBps) || patch.tipPresetsBps.some((n) => !Number.isInteger(n) || n < 0)) {
      throw new AdminValidationError("Tip presets must be non-negative integers in basis points.");
    }
  }

  const before = await prisma.storeConfig.findUniqueOrThrow({ where: { id: "default" } });
  const row = await prisma.storeConfig.update({
    where: { id: "default" },
    data: patch,
  });
  invalidateAllPublicCaches();

  const changed = keys.filter((k) => JSON.stringify(before[k as keyof typeof before]) !== JSON.stringify(patch[k]));
  await recordAdminAudit({
    userId: actor.userId,
    action: patch.taxRateBps !== undefined && patch.taxRateBps !== before.taxRateBps ? "CONFIG_TAX" : "CONFIG_UPDATE",
    entityType: "StoreConfig",
    entityId: "default",
    summary: `Updated store config: ${changed.join(", ") || "no-op"}`,
  });
  return row;
}

export async function listStoreHours() {
  return prisma.storeHours.findMany({ orderBy: { dayOfWeek: "asc" } });
}

export async function upsertStoreHours(
  rows: Array<{ dayOfWeek: number; openTime: string | null; closeTime: string | null; isClosed: boolean }>,
  userId: string,
) {
  if (rows.length !== 7) {
    throw new AdminValidationError("Provide all seven days of the week.");
  }
  const days = new Set(rows.map((r) => r.dayOfWeek));
  if (days.size !== 7 || [...days].some((d) => d < 0 || d > 6)) {
    throw new AdminValidationError("Each day of week 0–6 must appear exactly once.");
  }
  for (const row of rows) {
    if (!row.isClosed) {
      if (!row.openTime || !row.closeTime || !/^\d{2}:\d{2}$/.test(row.openTime) || !/^\d{2}:\d{2}$/.test(row.closeTime)) {
        throw new AdminValidationError("Open and close times must be HH:mm when the day is open.");
      }
    }
  }

  await prisma.$transaction(
    rows.map((row) =>
      prisma.storeHours.upsert({
        where: { dayOfWeek: row.dayOfWeek },
        create: {
          dayOfWeek: row.dayOfWeek,
          openTime: row.isClosed ? null : row.openTime,
          closeTime: row.isClosed ? null : row.closeTime,
          isClosed: row.isClosed,
        },
        update: {
          openTime: row.isClosed ? null : row.openTime,
          closeTime: row.isClosed ? null : row.closeTime,
          isClosed: row.isClosed,
        },
      }),
    ),
  );
  invalidateStoreConfigCache();
  await recordAdminAudit({
    userId,
    action: "HOURS_UPDATE",
    entityType: "StoreHours",
    entityId: null,
    summary: "Updated weekly hours",
  });
  return listStoreHours();
}

export async function listStoreClosures() {
  return prisma.storeClosure.findMany({ orderBy: { date: "asc" } });
}

export async function createStoreClosure(dateIso: string, reason: string | null, userId: string) {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new AdminValidationError("Date must be YYYY-MM-DD.");
  const row = await prisma.storeClosure.create({
    data: { date, reason: reason?.trim() || null },
  });
  invalidateStoreConfigCache();
  await recordAdminAudit({
    userId,
    action: "CLOSURE_CREATE",
    entityType: "StoreClosure",
    entityId: row.id,
    summary: `Closed ${dateIso}${reason ? ` (${reason.trim()})` : ""}`,
  });
  return row;
}

export async function updateStoreClosure(id: string, reason: string | null, userId: string) {
  const row = await prisma.storeClosure.update({
    where: { id },
    data: { reason: reason?.trim() || null },
  });
  invalidateStoreConfigCache();
  await recordAdminAudit({
    userId,
    action: "CLOSURE_UPDATE",
    entityType: "StoreClosure",
    entityId: id,
    summary: `Updated closure reason`,
  });
  return row;
}

export async function deleteStoreClosure(id: string, userId: string) {
  const row = await prisma.storeClosure.delete({ where: { id } });
  invalidateStoreConfigCache();
  await recordAdminAudit({
    userId,
    action: "CLOSURE_DELETE",
    entityType: "StoreClosure",
    entityId: id,
    summary: "Removed a closure date",
  });
  return row;
}
