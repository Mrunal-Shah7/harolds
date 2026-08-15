// SPRINT-1: shared domain enums and types re-exported for non-database consumers.
// Values mirror the Prisma schema enums exactly so application code never imports the DB client for types.

export const OrderStatus = {
  AWAITING_PAYMENT: "AWAITING_PAYMENT",
  PAID: "PAID",
  PRINTED: "PRINTED",
  IN_PROGRESS: "IN_PROGRESS",
  READY: "READY",
  PICKED_UP: "PICKED_UP",
  CANCELLED: "CANCELLED",
  REFUNDED: "REFUNDED",
  ABANDONED: "ABANDONED",
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const PaymentStatus = {
  PENDING: "PENDING",
  AUTHORISED: "AUTHORISED",
  CAPTURED: "CAPTURED",
  FAILED: "FAILED",
  UNKNOWN: "UNKNOWN",
  REFUNDED: "REFUNDED",
  PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const FulfilmentType = {
  PICKUP: "PICKUP",
} as const;
export type FulfilmentType = (typeof FulfilmentType)[keyof typeof FulfilmentType];

export const PrintTarget = {
  KITCHEN_TICKET: "KITCHEN_TICKET",
  COUNTER_RECEIPT: "COUNTER_RECEIPT",
} as const;
export type PrintTarget = (typeof PrintTarget)[keyof typeof PrintTarget];

export const PrintJobStatus = {
  QUEUED: "QUEUED",
  SENT: "SENT",
  PRINTED: "PRINTED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;
export type PrintJobStatus = (typeof PrintJobStatus)[keyof typeof PrintJobStatus];

export const JobType = {
  SMS_ORDER_READY: "SMS_ORDER_READY",
  SMS_ORDER_CONFIRMATION: "SMS_ORDER_CONFIRMATION",
  EMAIL_ORDER_RECEIPT: "EMAIL_ORDER_RECEIPT",
  EMAIL_ORDER_READY: "EMAIL_ORDER_READY",
  // SPRINT-2: manager alert job types
  ALERT_MANAGER_PRINT_FAILED: "ALERT_MANAGER_PRINT_FAILED",
  ALERT_MANAGER_JOB_DEAD: "ALERT_MANAGER_JOB_DEAD",
  ALERT_MANAGER_ORDER_UNACKNOWLEDGED: "ALERT_MANAGER_ORDER_UNACKNOWLEDGED",
  ALERT_MANAGER_PAYMENT_DISCREPANCY: "ALERT_MANAGER_PAYMENT_DISCREPANCY",
} as const;
export type JobType = (typeof JobType)[keyof typeof JobType];

/** Every declared job type — the worker registry must have a handler for each. */
export const ALL_JOB_TYPES = [
  JobType.SMS_ORDER_READY,
  JobType.SMS_ORDER_CONFIRMATION,
  JobType.EMAIL_ORDER_RECEIPT,
  JobType.EMAIL_ORDER_READY,
  JobType.ALERT_MANAGER_PRINT_FAILED,
  JobType.ALERT_MANAGER_JOB_DEAD,
  JobType.ALERT_MANAGER_ORDER_UNACKNOWLEDGED,
  JobType.ALERT_MANAGER_PAYMENT_DISCREPANCY,
] as const satisfies readonly JobType[];

export const MANAGER_ALERT_JOB_TYPES = [
  JobType.ALERT_MANAGER_PRINT_FAILED,
  JobType.ALERT_MANAGER_JOB_DEAD,
  JobType.ALERT_MANAGER_ORDER_UNACKNOWLEDGED,
  JobType.ALERT_MANAGER_PAYMENT_DISCREPANCY,
] as const satisfies readonly JobType[];

export function isManagerAlertJobType(type: string): boolean {
  return (MANAGER_ALERT_JOB_TYPES as readonly string[]).includes(type);
}

export const JobStatus = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  DEAD: "DEAD",
  /// SPRINT-7: operator cancelled — not selected, not a dead-letter that needs retry.
  CANCELLED: "CANCELLED",
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

// SPRINT-2: admin auth roles
export const AdminRole = {
  OWNER: "OWNER",
  MANAGER: "MANAGER",
  STAFF: "STAFF",
} as const;
export type AdminRole = (typeof AdminRole)[keyof typeof AdminRole];

/** Menu domain shapes (Sprint 1) — re-exported so app code need not import the DB client for typing. */
export type Category = {
  id: string;
  workbookId: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type MenuItem = {
  id: string;
  workbookId: string;
  categoryId: string;
  name: string;
  // SPRINT-2: URL/storefront slug unique within category
  slug: string;
  boardLabel: string | null;
  description: string | null;
  basePriceCents: number;
  imageUrl: string | null;
  isActive: boolean;
  isSoldOut: boolean;
  sortOrder: number;
  isFeatured: boolean;
  featuredSortOrder: number | null;
  isMostOrdered: boolean;
  mostOrderedSortOrder: number | null;
  isUnverifiedPrice: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type ModifierGroup = {
  id: string;
  workbookId: string;
  name: string;
  prompt: string;
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  sortOrder: number;
  isActive: boolean;
  isProvisional: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type ModifierOption = {
  id: string;
  workbookId: string;
  groupId: string;
  name: string;
  priceDeltaCents: number;
  sortOrder: number;
  isActive: boolean;
  isSoldOut: boolean;
  isDefaultSelected: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type ItemModifierGroup = {
  id: string;
  itemId: string;
  groupId: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

/** Minimal shape of StoreConfig for typed accessors */
export type StoreConfigData = {
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
  // SPRINT-2: daily reset / pad + manager alert contacts
  orderNumberResetHour: number;
  orderNumberPadWidth: number;
  normalPrepMinutes: number;
  busyPrepMinutes: number;
  isBusy: boolean;
  tippingEnabled: boolean;
  tipPresetsBps: number[];
  defaultTipPresetIndex: number;
  acceptingOrders: boolean;
  notAcceptingMessage: string | null;
  managerAlertPhone: string | null;
  managerAlertEmail: string | null;
};

// SPRINT-2: public API contract + error codes
export * from "./api/contract";
export * from "./api/errors";

// SPRINT-3: cart request / quote result contract (version 1.1.0)
export * from "./api/cart";

// SPRINT-4: order create / status contract (version 1.2.0)
export * from "./api/order";

// SPRINT-6: kitchen display internal types (not in docs/openapi/v1.yaml)
export * from "./kitchen";

// SPRINT-8: admin back-office internal types (not in docs/openapi/v1.yaml)
export * from "./admin";
