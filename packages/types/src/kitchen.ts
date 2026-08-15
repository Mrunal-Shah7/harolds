// SPRINT-6: kitchen display internal contract — not part of the public storefront OpenAPI.

export const KitchenErrorCode = {
  SESSION_REQUIRED: "SESSION_REQUIRED",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  SESSION_REVOKED: "SESSION_REVOKED",
  PIN_INVALID: "PIN_INVALID",
  PIN_LOCKED: "PIN_LOCKED",
  ACCOUNT_DISABLED: "ACCOUNT_DISABLED",
  ILLEGAL_TRANSITION: "ILLEGAL_TRANSITION",
  STALE_TRANSITION: "STALE_TRANSITION",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
} as const;
export type KitchenErrorCode = (typeof KitchenErrorCode)[keyof typeof KitchenErrorCode];

export const KITCHEN_ERROR_STATUS: Record<KitchenErrorCode, number> = {
  SESSION_REQUIRED: 401,
  SESSION_EXPIRED: 401,
  SESSION_REVOKED: 401,
  PIN_INVALID: 401,
  PIN_LOCKED: 423,
  ACCOUNT_DISABLED: 403,
  ILLEGAL_TRANSITION: 409,
  STALE_TRANSITION: 409,
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
};

export type KitchenStaffPublic = {
  id: string;
  displayName: string;
  role: string;
};

export type KitchenSessionUser = KitchenStaffPublic & {
  sessionExpiresAt: string;
};

export type KitchenQueueModifier = {
  groupName: string;
  optionName: string;
};

export type KitchenQueueLine = {
  quantity: number;
  itemName: string;
  boardLabel: string | null;
  customerNote: string | null;
  selectedModifiers: KitchenQueueModifier[];
};

export type KitchenQueueOrder = {
  id: string;
  orderNumber: string | null;
  customerFirstName: string;
  customerLastInitial: string;
  status: string;
  paidAt: string | null;
  printedAt: string | null;
  customerNote: string | null;
  lines: KitchenQueueLine[];
};

export type KitchenPrintHealthPrinter = {
  serial: string;
  lastPolledAt: string | null;
};

export type KitchenPrintHealth = {
  counts: Record<string, number>;
  oldestQueuedAgeMs: number | null;
  printers: KitchenPrintHealthPrinter[];
};

export type KitchenQueueResponse = {
  orders: KitchenQueueOrder[];
  printHealth: KitchenPrintHealth;
  pollIntervalMs: number;
  unackScreenMs: number;
  unackSoundMs: number;
};
