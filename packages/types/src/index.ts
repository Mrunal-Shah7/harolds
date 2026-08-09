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
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const PaymentStatus = {
  PENDING: "PENDING",
  AUTHORISED: "AUTHORISED",
  CAPTURED: "CAPTURED",
  FAILED: "FAILED",
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
} as const;
export type JobType = (typeof JobType)[keyof typeof JobType];

export const JobStatus = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  DEAD: "DEAD",
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

/** Snapshot entry stored on OrderLine.selectedModifiers */
export type SelectedModifierSnapshot = {
  groupName: string;
  groupPrompt: string;
  optionName: string;
  priceDeltaCents: number;
};

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
  normalPrepMinutes: number;
  busyPrepMinutes: number;
  isBusy: boolean;
  tippingEnabled: boolean;
  tipPresetsBps: number[];
  defaultTipPresetIndex: number;
  acceptingOrders: boolean;
  notAcceptingMessage: string | null;
};
