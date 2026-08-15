// SPRINT-8: owner-only staff accounts — distinct PINs, hashed secrets, session revoke.
import { randomBytes } from "node:crypto";
import { AdminRole } from "@harolds/types";
import { prisma } from "./client";
import { hashPin, isPlausiblePin, verifyPin } from "./pin";
import { assertPasswordPolicy, hashPassword, normalizeEmail } from "./password";
import { revokeUserSessions } from "./admin-auth";
import { recordAdminAudit } from "./admin-audit";
import { AdminValidationError } from "./admin-menu";

export class PinConflictError extends Error {
  constructor() {
    super("That PIN is already in use by an active account.");
    this.name = "PinConflictError";
  }
}

export async function pinTakenByAnotherActive(pin: string, exceptUserId?: string): Promise<boolean> {
  const users = await prisma.adminUser.findMany({
    where: {
      isActive: true,
      pinHash: { not: null },
      ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
    },
    select: { pinHash: true },
  });
  for (const user of users) {
    if (user.pinHash && (await verifyPin(pin, user.pinHash))) return true;
  }
  return false;
}

export function generateDistinctPin(): string {
  const n = randomBytes(2).readUInt16BE(0) % 10_000;
  return n.toString().padStart(4, "0");
}

export async function allocateUniquePin(exceptUserId?: string): Promise<string> {
  for (let i = 0; i < 40; i += 1) {
    const pin = generateDistinctPin();
    if (!(await pinTakenByAnotherActive(pin, exceptUserId))) return pin;
  }
  throw new AdminValidationError("Could not allocate a unique PIN. Try again.");
}

export async function listAdminUsers() {
  return prisma.adminUser.findMany({
    orderBy: [{ isActive: "desc" }, { displayName: "asc" }],
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      lockedUntil: true,
      createdAt: true,
      pinHash: true,
    },
  });
}

export async function listUserSessions(userId: string) {
  return prisma.adminSession.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    select: {
      id: true,
      purpose: true,
      createdAt: true,
      lastSeenAt: true,
      expiresAt: true,
      ipAddress: true,
      userAgent: true,
    },
  });
}

export async function createAdminUser(
  args: {
    email: string;
    displayName: string;
    role: string;
    password: string;
    pin?: string;
  },
  actorUserId: string,
): Promise<{ user: { id: string; email: string; displayName: string; role: string }; pinOnce: string | null }> {
  const email = normalizeEmail(args.email);
  const displayName = args.displayName.trim();
  if (!email || !email.includes("@")) throw new AdminValidationError("A valid email is required.");
  if (!displayName) throw new AdminValidationError("Display name is required.");
  if (args.role !== AdminRole.OWNER && args.role !== AdminRole.MANAGER && args.role !== AdminRole.STAFF) {
    throw new AdminValidationError("Role must be OWNER, MANAGER, or STAFF.");
  }
  assertPasswordPolicy(args.password, email);

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) throw new AdminValidationError("An account with that email already exists.");

  let pinOnce: string | null = null;
  let pinHash: string | null = null;
  if (args.role !== AdminRole.OWNER || args.pin) {
    const pin = args.pin?.trim() || (await allocateUniquePin());
    if (!isPlausiblePin(pin)) throw new AdminValidationError("PIN must be 4–8 digits.");
    if (await pinTakenByAnotherActive(pin)) throw new PinConflictError();
    pinHash = await hashPin(pin);
    pinOnce = pin;
  }

  const user = await prisma.adminUser.create({
    data: {
      email,
      displayName,
      role: args.role as typeof AdminRole.OWNER,
      passwordHash: await hashPassword(args.password),
      pinHash,
      isActive: true,
    },
  });
  await recordAdminAudit({
    userId: actorUserId,
    action: "STAFF_CREATE",
    entityType: "AdminUser",
    entityId: user.id,
    summary: `Created ${args.role} ${displayName}`,
  });
  return {
    user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
    pinOnce,
  };
}

export async function updateAdminUser(
  id: string,
  patch: {
    displayName?: string;
    role?: string;
    isActive?: boolean;
    password?: string;
    pin?: string;
  },
  actorUserId: string,
): Promise<{ pinOnce: string | null }> {
  const current = await prisma.adminUser.findUnique({ where: { id } });
  if (!current) throw new AdminValidationError("Account not found.");

  const data: Record<string, unknown> = {};
  if (patch.displayName !== undefined) {
    const displayName = patch.displayName.trim();
    if (!displayName) throw new AdminValidationError("Display name is required.");
    data.displayName = displayName;
  }
  if (patch.role !== undefined) {
    if (patch.role !== AdminRole.OWNER && patch.role !== AdminRole.MANAGER && patch.role !== AdminRole.STAFF) {
      throw new AdminValidationError("Role must be OWNER, MANAGER, or STAFF.");
    }
    data.role = patch.role;
  }
  if (patch.isActive !== undefined) {
    data.isActive = patch.isActive;
    if (patch.isActive === false) {
      await revokeUserSessions(id);
    }
  }
  if (patch.password) {
    assertPasswordPolicy(patch.password, current.email);
    data.passwordHash = await hashPassword(patch.password);
    data.failedPasswordAttempts = 0;
  }

  let pinOnce: string | null = null;
  if (patch.pin !== undefined) {
    const pin = patch.pin.trim();
    if (!isPlausiblePin(pin)) throw new AdminValidationError("PIN must be 4–8 digits.");
    if (await pinTakenByAnotherActive(pin, id)) throw new PinConflictError();
    data.pinHash = await hashPin(pin);
    pinOnce = pin;
  }

  await prisma.adminUser.update({ where: { id }, data });
  await recordAdminAudit({
    userId: actorUserId,
    action: patch.isActive === false ? "STAFF_DEACTIVATE" : "STAFF_UPDATE",
    entityType: "AdminUser",
    entityId: id,
    summary: `Updated ${current.displayName}`,
  });
  return { pinOnce };
}

export async function setUserPin(id: string, pin: string, actorUserId: string): Promise<string> {
  if (!isPlausiblePin(pin)) throw new AdminValidationError("PIN must be 4–8 digits.");
  if (await pinTakenByAnotherActive(pin, id)) throw new PinConflictError();
  await prisma.adminUser.update({ where: { id }, data: { pinHash: await hashPin(pin) } });
  await recordAdminAudit({
    userId: actorUserId,
    action: "STAFF_PIN_RESET",
    entityType: "AdminUser",
    entityId: id,
    summary: "Reset PIN",
  });
  return pin;
}
