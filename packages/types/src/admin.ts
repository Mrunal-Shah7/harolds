// SPRINT-8: admin back-office internal contract — not part of the public storefront OpenAPI.

export const AdminErrorCode = {
  SESSION_REQUIRED: "SESSION_REQUIRED",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  SESSION_REVOKED: "SESSION_REVOKED",
  PASSWORD_INVALID: "PASSWORD_INVALID",
  PASSWORD_LOCKED: "PASSWORD_LOCKED",
  ACCOUNT_DISABLED: "ACCOUNT_DISABLED",
  FORBIDDEN: "FORBIDDEN",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
} as const;
export type AdminErrorCode = (typeof AdminErrorCode)[keyof typeof AdminErrorCode];

export const ADMIN_ERROR_STATUS: Record<AdminErrorCode, number> = {
  SESSION_REQUIRED: 401,
  SESSION_EXPIRED: 401,
  SESSION_REVOKED: 401,
  PASSWORD_INVALID: 401,
  PASSWORD_LOCKED: 423,
  ACCOUNT_DISABLED: 403,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
};

export const AdminSessionPurpose = {
  KITCHEN: "KITCHEN",
  ADMIN: "ADMIN",
} as const;
export type AdminSessionPurpose = (typeof AdminSessionPurpose)[keyof typeof AdminSessionPurpose];

export type AdminPublicUser = {
  id: string;
  email: string;
  displayName: string;
  role: string;
};

export type AdminSessionView = {
  user: AdminPublicUser;
  expiresAt: string;
};
