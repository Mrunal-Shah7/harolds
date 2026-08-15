// SPRINT-6: PIN sign-in, lockout, hashed sessions, revocation.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { AdminRole } from "@harolds/types";
import { prisma } from "./client";
import { hashPin, hashSessionToken, verifyPin } from "./pin";
import {
  PinInvalidError,
  PinLockedError,
  resolveKitchenSession,
  revokeKitchenSession,
  SessionExpiredError,
  SessionRequiredError,
  SessionRevokedError,
  signInWithPin,
} from "./staff-auth";

const EMAIL = "s6auth-staff@localhost";
const PIN = "2468";
const CFG = {
  maxFailures: 3,
  lockoutMs: 5_000,
  sessionTtlMs: 60_000,
};

async function cleanup(): Promise<void> {
  await prisma.adminUser.deleteMany({ where: { email: { startsWith: "s6auth-" } } });
}

async function makeUser() {
  return prisma.adminUser.create({
    data: {
      email: EMAIL,
      displayName: "Test Staff",
      role: AdminRole.STAFF,
      passwordHash: await hashPin("00000000"),
      pinHash: await hashPin(PIN),
      isActive: true,
      failedPinAttempts: 0,
    },
  });
}

let dbAvailable = true;

before(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await cleanup();
  } catch (err) {
    dbAvailable = false;
    console.warn(`[staff-auth.test] skipping: ${(err as Error).message}`);
  }
});

after(async () => {
  if (dbAvailable) await cleanup();
});

describe("PIN sign-in", () => {
  it("issues a session on a correct PIN and stores only the token hash", async () => {
    if (!dbAvailable) return;
    await cleanup();
    const user = await makeUser();
    const issued = await signInWithPin(user.id, PIN, CFG);
    assert.ok(issued.token.startsWith("hks_"));
    const sessions = await prisma.adminSession.findMany({ where: { userId: user.id } });
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]?.tokenHash, hashSessionToken(issued.token));
    assert.notEqual(sessions[0]?.tokenHash, issued.token);
    assert.equal(sessions[0]?.tokenHash.includes(issued.token), false);
    const storedUser = await prisma.adminUser.findUniqueOrThrow({ where: { id: user.id } });
    assert.ok(storedUser.pinHash);
    assert.equal(storedUser.pinHash.includes(PIN), false);
    assert.equal(await verifyPin(PIN, storedUser.pinHash), true);
  });

  it("records a failed attempt and does not issue a session", async () => {
    if (!dbAvailable) return;
    await cleanup();
    const user = await makeUser();
    await assert.rejects(() => signInWithPin(user.id, "0000", CFG), (err: unknown) => {
      return err instanceof PinInvalidError;
    });
    const stored = await prisma.adminUser.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(stored.failedPinAttempts, 1);
    const sessions = await prisma.adminSession.findMany({ where: { userId: user.id } });
    assert.equal(sessions.length, 0);
  });

  it("locks after consecutive failures with a distinct error, then succeeds after the window", async () => {
    if (!dbAvailable) return;
    await cleanup();
    const user = await makeUser();
    const t0 = new Date("2026-08-15T12:00:00.000Z");
    await assert.rejects(() => signInWithPin(user.id, "0000", { ...CFG, now: t0 }));
    await assert.rejects(() => signInWithPin(user.id, "0000", { ...CFG, now: t0 }));
    await assert.rejects(
      () => signInWithPin(user.id, "0000", { ...CFG, now: t0 }),
      (err: unknown) => {
        assert.ok(err instanceof PinLockedError);
        assert.ok(err.retryAfterSeconds >= 1);
        return true;
      },
    );
    await assert.rejects(
      () => signInWithPin(user.id, PIN, { ...CFG, now: t0 }),
      (err: unknown) => err instanceof PinLockedError,
    );
    const afterLock = new Date(t0.getTime() + CFG.lockoutMs + 1);
    const issued = await signInWithPin(user.id, PIN, { ...CFG, now: afterLock });
    assert.ok(issued.token.startsWith("hks_"));
    const stored = await prisma.adminUser.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(stored.failedPinAttempts, 0);
    assert.equal(stored.lockedUntil, null);
  });

  it("revokes a session so it can no longer authorise", async () => {
    if (!dbAvailable) return;
    await cleanup();
    const user = await makeUser();
    const issued = await signInWithPin(user.id, PIN, CFG);
    const live = await resolveKitchenSession(issued.token);
    assert.equal(live.userId, user.id);
    await revokeKitchenSession(issued.token);
    await assert.rejects(() => resolveKitchenSession(issued.token), (err: unknown) => {
      return err instanceof SessionRevokedError;
    });
  });

  it("does not authenticate one seeded-style account with another account's PIN", async () => {
    if (!dbAvailable) return;
    await prisma.adminUser.deleteMany({ where: { email: { startsWith: "s6auth-" } } });
    const staffPin = "2468";
    const managerPin = "1357";
    const staff = await prisma.adminUser.create({
      data: {
        email: "s6auth-staff@localhost",
        displayName: "Test Staff",
        role: AdminRole.STAFF,
        passwordHash: await hashPin("00000000"),
        pinHash: await hashPin(staffPin),
        isActive: true,
      },
    });
    const manager = await prisma.adminUser.create({
      data: {
        email: "s6auth-manager@localhost",
        displayName: "Test Manager",
        role: AdminRole.MANAGER,
        passwordHash: await hashPin("00000000"),
        pinHash: await hashPin(managerPin),
        isActive: true,
      },
    });
    await assert.rejects(() => signInWithPin(staff.id, managerPin, CFG), (err: unknown) => {
      return err instanceof PinInvalidError;
    });
    await assert.rejects(() => signInWithPin(manager.id, staffPin, CFG), (err: unknown) => {
      return err instanceof PinInvalidError;
    });
    const asStaff = await signInWithPin(staff.id, staffPin, CFG);
    const asManager = await signInWithPin(manager.id, managerPin, CFG);
    assert.equal(asStaff.user.displayName, "Test Staff");
    assert.equal(asManager.user.displayName, "Test Manager");
    assert.notEqual(asStaff.token, asManager.token);
  });

  it("distinguishes missing, expired, and revoked sessions", async () => {
    if (!dbAvailable) return;
    await cleanup();
    const user = await makeUser();
    await assert.rejects(() => resolveKitchenSession(null), (err: unknown) => err instanceof SessionRequiredError);
    await assert.rejects(() => resolveKitchenSession("short"), (err: unknown) => err instanceof SessionRequiredError);

    const issued = await signInWithPin(user.id, PIN, { ...CFG, sessionTtlMs: 1 });
    const expiredAt = new Date(Date.now() + 50);
    await prisma.adminSession.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    await assert.rejects(() => resolveKitchenSession(issued.token, expiredAt), (err: unknown) => {
      return err instanceof SessionExpiredError;
    });
  });
});
