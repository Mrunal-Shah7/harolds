// SPRINT-8: email/password admin sign-in, hashed sessions, role checks, lockout.
import { AdminRole, AdminSessionPurpose } from "@harolds/types";
import { prisma } from "./client";
import {
  AccountDisabledError,
  SessionExpiredError,
  SessionRequiredError,
  SessionRevokedError,
} from "./staff-auth";
import { hashSessionToken } from "./pin";
import {
  assertPasswordPolicy,
  generateAdminSessionToken,
  hashPassword,
  normalizeEmail,
  verifyPassword,
} from "./password";

export class PasswordInvalidError extends Error {
  constructor() {
    super("Incorrect email or password.");
    this.name = "PasswordInvalidError";
  }
}

export class PasswordLockedError extends Error {
  constructor(
    public readonly lockedUntil: Date,
    public readonly retryAfterSeconds: number,
  ) {
    super(`Too many failed sign-in attempts. Try again in ${retryAfterSeconds} seconds.`);
    this.name = "PasswordLockedError";
  }
}

export class AdminForbiddenError extends Error {
  constructor(message = "You do not have access to this area.") {
    super(message);
    this.name = "AdminForbiddenError";
  }
}

export type PasswordAuthConfig = {
  maxFailures: number;
  lockoutMs: number;
  sessionTtlMs: number;
  now?: Date;
};

export type ResolvedAdminSession = {
  sessionId: string;
  userId: string;
  email: string;
  displayName: string;
  role: typeof AdminRole.MANAGER | typeof AdminRole.OWNER;
  expiresAt: Date;
};

export type IssuedAdminSession = {
  token: string;
  expiresAt: Date;
  user: {
    id: string;
    email: string;
    displayName: string;
    role: string;
  };
};

function lockoutRetrySeconds(lockedUntil: Date, now: Date): number {
  return Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000));
}

function asAdminRole(role: string): typeof AdminRole.MANAGER | typeof AdminRole.OWNER {
  if (role === AdminRole.OWNER) return AdminRole.OWNER;
  if (role === AdminRole.MANAGER) return AdminRole.MANAGER;
  throw new AdminForbiddenError("Staff accounts use the kitchen display, not the back office.");
}

export function assertMinRole(
  role: string,
  minRole: typeof AdminRole.MANAGER | typeof AdminRole.OWNER,
): void {
  if (role === AdminRole.STAFF) {
    throw new AdminForbiddenError("Staff accounts use the kitchen display, not the back office.");
  }
  if (minRole === AdminRole.OWNER && role !== AdminRole.OWNER) {
    throw new AdminForbiddenError("Only the owner can do this.");
  }
  if (role !== AdminRole.OWNER && role !== AdminRole.MANAGER) {
    throw new AdminForbiddenError();
  }
}

export async function signInWithPassword(
  emailRaw: string,
  password: string,
  config: PasswordAuthConfig,
  meta?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<IssuedAdminSession> {
  const now = config.now ?? new Date();
  const email = normalizeEmail(emailRaw);
  const user = await prisma.adminUser.findUnique({ where: { email } });
  if (!user) {
    throw new PasswordInvalidError();
  }
  if (!user.isActive) {
    throw new AccountDisabledError();
  }
  if (user.role === AdminRole.STAFF) {
    throw new AdminForbiddenError("Staff accounts use the kitchen display, not the back office.");
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > now.getTime()) {
    throw new PasswordLockedError(user.lockedUntil, lockoutRetrySeconds(user.lockedUntil, now));
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    const failures = user.failedPasswordAttempts + 1;
    const locks = failures >= config.maxFailures;
    const lockedUntil = locks ? new Date(now.getTime() + config.lockoutMs) : null;
    await prisma.adminUser.update({
      where: { id: user.id },
      data: {
        failedPasswordAttempts: failures,
        lockedUntil,
      },
    });
    if (lockedUntil) {
      throw new PasswordLockedError(lockedUntil, lockoutRetrySeconds(lockedUntil, now));
    }
    throw new PasswordInvalidError();
  }

  const token = generateAdminSessionToken();
  const expiresAt = new Date(now.getTime() + config.sessionTtlMs);
  await prisma.$transaction([
    prisma.adminUser.update({
      where: { id: user.id },
      data: {
        failedPasswordAttempts: 0,
        lockedUntil: null,
        lastLoginAt: now,
      },
    }),
    prisma.adminSession.create({
      data: {
        userId: user.id,
        tokenHash: hashSessionToken(token),
        expiresAt,
        purpose: AdminSessionPurpose.ADMIN,
        lastSeenAt: now,
        ipAddress: meta?.ipAddress ?? null,
        userAgent: meta?.userAgent ?? null,
      },
    }),
  ]);

  return {
    token,
    expiresAt,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    },
  };
}

export async function resolveAdminSession(
  rawToken: string | null | undefined,
  now = new Date(),
): Promise<ResolvedAdminSession> {
  if (!rawToken || rawToken.trim().length < 16) {
    throw new SessionRequiredError();
  }
  const tokenHash = hashSessionToken(rawToken.trim());
  const session = await prisma.adminSession.findUnique({
    where: { tokenHash },
    include: {
      user: { select: { id: true, email: true, displayName: true, role: true, isActive: true } },
    },
  });
  if (!session) {
    throw new SessionRequiredError();
  }
  if (session.purpose !== AdminSessionPurpose.ADMIN) {
    throw new AdminForbiddenError("Staff accounts use the kitchen display, not the back office.");
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
  const role = asAdminRole(session.user.role);

  await prisma.adminSession.update({
    where: { id: session.id },
    data: { lastSeenAt: now },
  });

  return {
    sessionId: session.id,
    userId: session.user.id,
    email: session.user.email,
    displayName: session.user.displayName,
    role,
    expiresAt: session.expiresAt,
  };
}

export async function revokeAdminSession(rawToken: string, now = new Date()): Promise<void> {
  const session = await resolveAdminSession(rawToken, now);
  await prisma.adminSession.update({
    where: { id: session.sessionId },
    data: { revokedAt: now },
  });
}

export async function revokeUserSessions(userId: string, now = new Date()): Promise<number> {
  const result = await prisma.adminSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now },
  });
  return result.count;
}

export async function setAdminPassword(userId: string, password: string, email?: string): Promise<void> {
  assertPasswordPolicy(password, email);
  await prisma.adminUser.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password), failedPasswordAttempts: 0 },
  });
}

export {
  hashPassword,
  verifyPassword,
  assertPasswordPolicy,
  normalizeEmail,
  generateAdminSessionToken,
};
export { PasswordTooWeakError } from "./password";
