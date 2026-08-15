// SPRINT-8: PIN uniqueness across active accounts; deactivated accounts keep history.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { AdminRole } from "@harolds/types";
import { prisma } from "./client";
import { hashPassword } from "./password";
import { signInWithPin } from "./staff-auth";
import { createAdminUser, PinConflictError, updateAdminUser } from "./admin-staff";

let dbAvailable = true;

async function cleanup(): Promise<void> {
  await prisma.adminUser.deleteMany({ where: { email: { startsWith: "s8staff-" } } });
}

before(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await cleanup();
  } catch (err) {
    dbAvailable = false;
    console.warn(`[admin-staff.test] skipping: ${(err as Error).message}`);
  }
});

after(async () => {
  if (dbAvailable) await cleanup();
});

describe("staff PIN uniqueness", () => {
  it("rejects a duplicate PIN on another active account", async () => {
    if (!dbAvailable) return;
    const actor = await prisma.adminUser.create({
      data: {
        email: "s8staff-actor@localhost",
        displayName: "Actor",
        role: AdminRole.OWNER,
        passwordHash: await hashPassword("HaroldsOwner1!"),
        isActive: true,
      },
    });
    const first = await createAdminUser(
      {
        email: "s8staff-one@localhost",
        displayName: "One",
        role: AdminRole.STAFF,
        password: "HaroldsStaff1!",
        pin: "4242",
      },
      actor.id,
    );
    assert.equal(first.pinOnce, "4242");
    await assert.rejects(
      () =>
        createAdminUser(
          {
            email: "s8staff-two@localhost",
            displayName: "Two",
            role: AdminRole.STAFF,
            password: "HaroldsStaff1!",
            pin: "4242",
          },
          actor.id,
        ),
      PinConflictError,
    );
  });

  it("shows a PIN once and stores only a hash; deactivated users cannot sign in", async () => {
    if (!dbAvailable) return;
    const actor = await prisma.adminUser.findUniqueOrThrow({ where: { email: "s8staff-actor@localhost" } });
    const created = await createAdminUser(
      {
        email: "s8staff-three@localhost",
        displayName: "Three",
        role: AdminRole.STAFF,
        password: "HaroldsStaff1!",
        pin: "4343",
      },
      actor.id,
    );
    const stored = await prisma.adminUser.findUniqueOrThrow({ where: { id: created.user.id } });
    assert.ok(stored.pinHash);
    assert.equal(stored.pinHash.includes("4343"), false);
    await signInWithPin(created.user.id, "4343", {
      maxFailures: 5,
      lockoutMs: 60_000,
      sessionTtlMs: 60_000,
    });
    await updateAdminUser(created.user.id, { isActive: false }, actor.id);
    await assert.rejects(
      () =>
        signInWithPin(created.user.id, "4343", {
          maxFailures: 5,
          lockoutMs: 60_000,
          sessionTtlMs: 60_000,
        }),
      /disabled/i,
    );
    const still = await prisma.adminUser.findUniqueOrThrow({ where: { id: created.user.id } });
    assert.equal(still.displayName, "Three");
  });
});
