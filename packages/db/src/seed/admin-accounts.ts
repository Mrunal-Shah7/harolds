// Real back-office accounts for a branch, read from a private file that is never committed:
// seed-accounts.json at the repository root (gitignored, like .env), or the path in
// SEED_ACCOUNTS_PATH. seed-accounts.example.json is the committed template.
//
// Insert-if-absent: an account that already exists is left exactly as it is, so re-running the
// seed never resets a password someone has since changed in the back office. Every password must
// pass the same policy the back office enforces (password.ts).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AdminRole } from "@harolds/types";
import { prisma } from "../client";
import { assertPasswordPolicy, hashPassword, normalizeEmail } from "../password";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

export function adminAccountsPath(env: NodeJS.ProcessEnv): string {
  return env.SEED_ACCOUNTS_PATH ? path.resolve(env.SEED_ACCOUNTS_PATH) : path.join(ROOT, "seed-accounts.json");
}

export type AdminAccountSeed = {
  email: string;
  password: string;
  displayName: string;
  role: AdminRole;
};

const ROLES = new Set<string>(Object.values(AdminRole));

/**
 * Parse and check the whole file before anything is written. Returns every problem at once, so a
 * file with two bad rows is fixed in one pass. Problems never include the password itself.
 */
export function parseAdminAccounts(raw: unknown): { accounts: AdminAccountSeed[]; problems: string[] } {
  const problems: string[] = [];
  const list = (raw as { accounts?: unknown })?.accounts;
  if (!Array.isArray(list) || list.length === 0) {
    return { accounts: [], problems: ['The file must look like { "accounts": [ { "email", "password", "displayName", "role" } ] }.'] };
  }
  const accounts: AdminAccountSeed[] = [];
  const seen = new Set<string>();
  list.forEach((row: Record<string, unknown>, i) => {
    const label = `accounts[${i}]`;
    const email = typeof row?.email === "string" ? normalizeEmail(row.email) : "";
    const who = email ? `${label} (${email})` : label;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push(`${label}: "email" is missing or not an email address.`);
    else if (seen.has(email)) problems.push(`${who}: listed twice.`);
    seen.add(email);
    const password = typeof row?.password === "string" ? row.password : "";
    try {
      assertPasswordPolicy(password, email || undefined);
    } catch (err) {
      problems.push(`${who}: password rejected — ${(err as Error).message}`);
    }
    const displayName = typeof row?.displayName === "string" ? row.displayName.trim() : "";
    if (!displayName) problems.push(`${who}: "displayName" is required.`);
    const role = typeof row?.role === "string" ? row.role.trim().toUpperCase() : "";
    if (!ROLES.has(role)) problems.push(`${who}: "role" must be one of ${[...ROLES].join(", ")}.`);
    accounts.push({ email, password, displayName, role: role as AdminRole });
  });
  return { accounts: problems.length ? [] : accounts, problems };
}

export function readAdminAccounts(file: string): { accounts: AdminAccountSeed[]; problems: string[] } {
  if (!existsSync(file)) {
    return {
      accounts: [],
      problems: [
        `No accounts file at ${file}.`,
        "Copy seed-accounts.example.json to seed-accounts.json (it is gitignored) and fill in the real accounts.",
      ],
    };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    return { accounts: [], problems: [`${file} is not valid JSON: ${(err as Error).message}`] };
  }
  return parseAdminAccounts(raw);
}

export async function seedAdminAccounts(accounts: AdminAccountSeed[]): Promise<void> {
  for (const account of accounts) {
    const existing = await prisma.adminUser.findUnique({ where: { email: account.email } });
    if (existing) {
      console.log(`admin_user: ${account.email} already exists — left as-is (password not changed)`);
      continue;
    }
    await prisma.adminUser.create({
      data: {
        email: account.email,
        displayName: account.displayName,
        role: account.role,
        passwordHash: await hashPassword(account.password),
        pinHash: null,
        isActive: true,
      },
    });
    console.log(`admin_user: created ${account.email} (${account.role}). Set a kitchen PIN on /admin/staff if needed.`);
  }
}
