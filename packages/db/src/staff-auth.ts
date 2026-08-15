// SPRINT-6: staff PIN sign-in, hashed sessions, visible lockout.
import { prisma } from "./client";
import { generateSessionToken, hashPin, hashSessionToken, isPlausiblePin, verifyPin } from "./pin";

export class PinInvalidError extends Error {
  constructor() {
    super("Incorrect PIN.");
    this.name = "PinInvalidError";
  }
}

export class PinLockedError extends Error {
  constructor(
    public readonly lockedUntil: Date,
    public readonly retryAfterSeconds: number,
  ) {
    super(`Too many failed PIN attempts. Try again in ${retryAfterSeconds} seconds.`);
    this.name = "PinLockedError";
  }
}

export class AccountDisabledError extends Error {
  constructor() {
    super("This staff account is disabled.");
    this.name = "AccountDisabledError";
  }
}

export class SessionRequiredError extends Error {
  readonly code = "SESSION_REQUIRED" as const;
  constructor() {
    super("Sign-in required.");
    this.name = "SessionRequiredError";
  }
}

export class SessionExpiredError extends Error {
  readonly code = "SESSION_EXPIRED" as const;
  constructor() {
    super("Session expired. Sign in again.");
    this.name = "SessionExpiredError";
  }
}

export class SessionRevokedError extends Error {
  readonly code = "SESSION_REVOKED" as const;
  constructor() {
    super("Session ended. Sign in again.");
    this.name = "SessionRevokedError";
  }
}

export type PinAuthConfig = {
  maxFailures: number;
  lockoutMs: number;
  sessionTtlMs: number;
  now?: Date;
};

export type StaffRosterEntry = {
  id: string;
  displayName: string;
  role: string;
};

export type IssuedSession = {
  token: string;
  expiresAt: Date;
  user: StaffRosterEntry;
};

export type ResolvedKitchenSession = {
  sessionId: string;
  userId: string;
  displayName: string;
  role: string;
  expiresAt: Date;
};

function lockoutRetrySeconds(lockedUntil: Date, now: Date): number {
  return Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000));
}

export async function listKitchenRoster(): Promise<StaffRosterEntry[]> {
  const rows = await prisma.adminUser.findMany({
    where: { isActive: true, pinHash: { not: null } },
    orderBy: { displayName: "asc" },
    select: { id: true, displayName: true, role: true },
  });
  return rows.map((r) => ({ id: r.id, displayName: r.displayName, role: r.role }));
}

export async function signInWithPin(
  userId: string,
  pin: string,
  config: PinAuthConfig,
  meta?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<IssuedSession> {
  const now = config.now ?? new Date();
  const user = await prisma.adminUser.findUnique({ where: { id: userId } });
  if (!user || !user.pinHash) {
    throw new PinInvalidError();
  }
  if (!user.isActive) {
    throw new AccountDisabledError();
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > now.getTime()) {
    throw new PinLockedError(user.lockedUntil, lockoutRetrySeconds(user.lockedUntil, now));
  }

  if (!isPlausiblePin(pin) || !(await verifyPin(pin, user.pinHash))) {
    const failures = user.failedPinAttempts + 1;
    const locks = failures >= config.maxFailures;
    const lockedUntil = locks ? new Date(now.getTime() + config.lockoutMs) : null;
    await prisma.adminUser.update({
      where: { id: user.id },
      data: {
        failedPinAttempts: failures,
        lockedUntil,
      },
    });
    if (lockedUntil) {
      throw new PinLockedError(lockedUntil, lockoutRetrySeconds(lockedUntil, now));
    }
    throw new PinInvalidError();
  }

  const token = generateSessionToken();
  const expiresAt = new Date(now.getTime() + config.sessionTtlMs);
  await prisma.$transaction([
    prisma.adminUser.update({
      where: { id: user.id },
      data: {
        failedPinAttempts: 0,
        lockedUntil: null,
        lastLoginAt: now,
      },
    }),
    prisma.adminSession.create({
      data: {
        userId: user.id,
        tokenHash: hashSessionToken(token),
        expiresAt,
        purpose: "KITCHEN",
        lastSeenAt: now,
        ipAddress: meta?.ipAddress ?? null,
        userAgent: meta?.userAgent ?? null,
      },
    }),
  ]);

  return {
    token,
    expiresAt,
    user: { id: user.id, displayName: user.displayName, role: user.role },
  };
}

export async function resolveKitchenSession(
  rawToken: string | null | undefined,
  now = new Date(),
): Promise<ResolvedKitchenSession> {
  if (!rawToken || rawToken.trim().length < 16) {
    throw new SessionRequiredError();
  }
  const tokenHash = hashSessionToken(rawToken.trim());
  const session = await prisma.adminSession.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, displayName: true, role: true, isActive: true } } },
  });
  if (!session) {
    throw new SessionRequiredError();
  }
  if (session.revokedAt) {
    throw new SessionRevokedError();
  }
  if (session.expiresAt.getTime() <= now.getTime()) {
    throw new SessionExpiredError();
  }
  if (!session.user.isActive) {
    throw new AccountDisabledError();
  }
  if (session.purpose === "ADMIN") {
    throw new SessionRequiredError();
  }
  return {
    sessionId: session.id,
    userId: session.user.id,
    displayName: session.user.displayName,
    role: session.user.role,
    expiresAt: session.expiresAt,
  };
}

export async function revokeKitchenSession(rawToken: string, now = new Date()): Promise<void> {
  const session = await resolveKitchenSession(rawToken, now);
  await prisma.adminSession.update({
    where: { id: session.sessionId },
    data: { revokedAt: now },
  });
}

/** Test/seed helper — hashes a PIN onto an existing or new staff row. */
export async function setStaffPin(userId: string, pin: string): Promise<void> {
  if (!isPlausiblePin(pin)) {
    throw new Error("PIN must be 4–8 digits.");
  }
  await prisma.adminUser.update({
    where: { id: userId },
    data: { pinHash: await hashPin(pin) },
  });
}

export { hashPin, verifyPin, hashSessionToken, isPlausiblePin };
