// SPRINT-8: email/password admin sessions, roles, lockout, revocation.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { AdminRole, AdminSessionPurpose } from "@harolds/types";
import { prisma } from "./client";
import { hashPassword } from "./password";
import { hashPin, hashSessionToken } from "./pin";
import { signInWithPin } from "./staff-auth";
import {
  AdminForbiddenError,
  assertMinRole,
  PasswordInvalidError,
  PasswordLockedError,
  resolveAdminSession,
  revokeAdminSession,
  revokeUserSessions,
  signInWithPassword,
} from "./admin-auth";

const CFG = {
  maxFailures: 3,
  lockoutMs: 5_000,
  sessionTtlMs: 60_000,
};

async function cleanup(): Promise<void> {
  await prisma.adminUser.deleteMany({ where: { email: { startsWith: "s8auth-" } } });
}

async function makeUser(role: (typeof AdminRole)[keyof typeof AdminRole], password = "HaroldsOwner1!") {
  const email = `s8auth-${role.toLowerCase()}-${Math.random().toString(16).slice(2)}@localhost`;
  return prisma.adminUser.create({
    data: {
      email,
      displayName: `S8 ${role}`,
      role,
      passwordHash: await hashPassword(password),
      pinHash: await hashPin("2468"),
      isActive: true,
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
    console.warn(`[admin-auth.test] skipping: ${(err as Error).message}`);
  }
});

after(async () => {
  if (dbAvailable) await cleanup();
});

describe("password sign-in", () => {
  it("issues an ADMIN session on a correct password and stores only the token hash", async () => {
    if (!dbAvailable) return;
    const user = await makeUser(AdminRole.OWNER);
    const issued = await signInWithPassword(user.email, "HaroldsOwner1!", CFG);
    assert.ok(issued.token.startsWith("has_"));
    const sessions = await prisma.adminSession.findMany({ where: { userId: user.id, purpose: AdminSessionPurpose.ADMIN } });
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]?.tokenHash, hashSessionToken(issued.token));
    assert.notEqual(sessions[0]?.tokenHash, issued.token);
    const resolved = await resolveAdminSession(issued.token);
    assert.equal(resolved.userId, user.id);
    assert.equal(resolved.role, AdminRole.OWNER);
  });

  it("does not issue a session on a wrong password", async () => {
    if (!dbAvailable) return;
    const user = await makeUser(AdminRole.MANAGER);
    await assert.rejects(() => signInWithPassword(user.email, "WrongPass99!", CFG), PasswordInvalidError);
    const sessions = await prisma.adminSession.findMany({ where: { userId: user.id } });
    assert.equal(sessions.length, 0);
    const stored = await prisma.adminUser.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(stored.failedPasswordAttempts, 1);
  });

  it("rejects a staff account even with the correct password", async () => {
    if (!dbAvailable) return;
    const user = await makeUser(AdminRole.STAFF);
    await assert.rejects(
      () => signInWithPassword(user.email, "HaroldsOwner1!", CFG),
      AdminForbiddenError,
    );
    const sessions = await prisma.adminSession.findMany({ where: { userId: user.id } });
    assert.equal(sessions.length, 0);
  });

  it("rejects a kitchen PIN session on the admin resolver", async () => {
    if (!dbAvailable) return;
    const user = await makeUser(AdminRole.MANAGER);
    const kitchen = await signInWithPin(user.id, "2468", CFG);
    await assert.rejects(() => resolveAdminSession(kitchen.token), AdminForbiddenError);
  });

  it("locks after consecutive failures with a distinct error, then succeeds after the window", async () => {
    if (!dbAvailable) return;
    const user = await makeUser(AdminRole.OWNER, "HaroldsOwner1!");
    await assert.rejects(() => signInWithPassword(user.email, "WrongPass99!", CFG), PasswordInvalidError);
    await assert.rejects(() => signInWithPassword(user.email, "WrongPass99!", CFG), PasswordInvalidError);
    await assert.rejects(() => signInWithPassword(user.email, "WrongPass99!", CFG), PasswordLockedError);
    await assert.rejects(() => signInWithPassword(user.email, "HaroldsOwner1!", CFG), PasswordLockedError);
    const later = new Date(Date.now() + CFG.lockoutMs + 50);
    const issued = await signInWithPassword(user.email, "HaroldsOwner1!", { ...CFG, now: later });
    assert.ok(issued.token.startsWith("has_"));
  });

  it("revokes a session so it immediately stops authorising", async () => {
    if (!dbAvailable) return;
    const user = await makeUser(AdminRole.OWNER);
    const issued = await signInWithPassword(user.email, "HaroldsOwner1!", CFG);
    await revokeAdminSession(issued.token);
    await assert.rejects(() => resolveAdminSession(issued.token), /Session ended/);
  });

  it("lets an owner revoke another user's sessions", async () => {
    if (!dbAvailable) return;
    const manager = await makeUser(AdminRole.MANAGER);
    const issued = await signInWithPassword(manager.email, "HaroldsOwner1!", CFG);
    const n = await revokeUserSessions(manager.id);
    assert.equal(n, 1);
    await assert.rejects(() => resolveAdminSession(issued.token), /Session ended/);
  });

  it("rejects a manager on owner-only checks and staff everywhere", () => {
    assert.throws(() => assertMinRole(AdminRole.STAFF, AdminRole.MANAGER), AdminForbiddenError);
    assert.throws(() => assertMinRole(AdminRole.MANAGER, AdminRole.OWNER), AdminForbiddenError);
    assertMinRole(AdminRole.MANAGER, AdminRole.MANAGER);
    assertMinRole(AdminRole.OWNER, AdminRole.OWNER);
    assertMinRole(AdminRole.OWNER, AdminRole.MANAGER);
  });
});
