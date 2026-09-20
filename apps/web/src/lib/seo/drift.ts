// SPRINT-18: the drift detector. The SEO business record is a deliberate second record of the
// address, phone and hours that StoreConfig / StoreHours already hold. Two records of one fact
// drift, and drift here is a customer arriving at a locked door — so they are compared and every
// disagreement is named, with both values.
//
// Critical rule 7: this only COMPARES. There is no sync in either direction, and nothing in this
// sprint offers one. The operator resolves a difference by editing whichever record is wrong.
//
// Comparison is deliberately forgiving about formatting (case, spacing, "." and ",", ZIP vs
// ZIP+4) and strict about substance. It compares the weekly schedule only: one-off closures and
// trading overrides are temporary by design and have no counterpart in structured data.
import type { SeoBusinessData, SeoOpeningHoursRow } from "@harolds/types";
import { DAY_NAMES } from "./validation";

export type DriftStoreRecord = {
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  /** As stored, for display. */
  contactPhone: string;
  /** Normalised by the caller; null when the stored value is not a valid phone number. */
  contactPhoneE164: string | null;
  hours: Array<{ dayOfWeek: number; openTime: string | null; closeTime: string | null; isClosed: boolean }>;
};

export type DriftRow = {
  field: string;
  label: string;
  seo: string;
  store: string;
  agrees: boolean;
};

export type DriftReport = {
  inAgreement: boolean;
  rows: DriftRow[];
  /** Only the rows that disagree. */
  differences: DriftRow[];
};

const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();

function samePostal(a: string, b: string): boolean {
  const zip = /^(\d{5})(?:-\d{4})?$/;
  const ma = a.trim().match(zip);
  const mb = b.trim().match(zip);
  if (ma && mb) return ma[1] === mb[1];
  return norm(a) === norm(b);
}

function describeSeoDay(rows: SeoOpeningHoursRow[]): string {
  if (rows.length === 0) return "Not set";
  if (rows.some((r) => r.isClosed)) return "Closed";
  return [...rows]
    .sort((a, b) => (a.opens ?? "").localeCompare(b.opens ?? ""))
    .map((r) => `${r.opens}–${r.closes}${r.overnight ? " (next day)" : ""}`)
    .join(", ");
}

function describeStoreDay(row: DriftStoreRecord["hours"][number] | undefined): string {
  if (!row) return "Not set";
  if (row.isClosed) return "Closed";
  if (!row.openTime || !row.closeTime) return "Not set";
  return `${row.openTime}–${row.closeTime}${row.closeTime <= row.openTime ? " (next day)" : ""}`;
}

export function detectDrift(business: SeoBusinessData, store: DriftStoreRecord): DriftReport {
  const rows: DriftRow[] = [];
  const storeStreet = [store.addressLine1, store.addressLine2].filter((s) => s && s.trim()).join(", ");

  rows.push({
    field: "streetAddress",
    label: "Street address",
    seo: business.streetAddress,
    store: storeStreet,
    agrees: norm(business.streetAddress) === norm(storeStreet),
  });
  rows.push({
    field: "addressLocality",
    label: "City",
    seo: business.addressLocality,
    store: store.city,
    agrees: norm(business.addressLocality) === norm(store.city),
  });
  rows.push({
    field: "addressRegion",
    label: "State",
    seo: business.addressRegion,
    store: store.state,
    agrees: norm(business.addressRegion) === norm(store.state),
  });
  rows.push({
    field: "postalCode",
    label: "Postal code",
    seo: business.postalCode,
    store: store.postalCode,
    agrees: samePostal(business.postalCode, store.postalCode),
  });
  rows.push({
    field: "telephone",
    label: "Telephone",
    seo: business.telephone ?? "Not set",
    store: store.contactPhoneE164 ?? `${store.contactPhone} (not a valid phone number)`,
    agrees: business.telephone !== null && business.telephone === store.contactPhoneE164,
  });

  for (let day = 0; day <= 6; day++) {
    const seoRows = business.hours.filter((h) => h.dayOfWeek === day);
    const storeRow = store.hours.find((h) => h.dayOfWeek === day);
    const seo = describeSeoDay(seoRows);
    const storeText = describeStoreDay(storeRow);
    rows.push({ field: `hours.${day}`, label: `${DAY_NAMES[day]} hours`, seo, store: storeText, agrees: seo !== "Not set" && seo === storeText });
  }

  const differences = rows.filter((r) => !r.agrees);
  return { inAgreement: differences.length === 0, rows, differences };
}
