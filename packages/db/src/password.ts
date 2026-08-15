// SPRINT-8: password hashing — slow scrypt with per-row salt; never a fast general-purpose hash.
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derived) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(derived as Buffer);
    });
  });
}

/** Cost parameter 2^15 — slower than Node's default 2^14 used for PINs. */
const SCRYPT_N = 32_768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;
const SALT_BYTES = 16;
const SCRYPT_MAXMEM = 256 * 1024 * 1024;

const WEAK_EXACT = new Set([
  "password",
  "password1",
  "password12",
  "password123",
  "1234567890",
  "123456789",
  "qwertyuiop",
  "letmein123",
  "welcome123",
  "changeme12",
  "adminadmin",
  "harolds123",
  "chicken123",
  "oaklawn123",
]);

export class PasswordTooWeakError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PasswordTooWeakError";
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function assertPasswordPolicy(password: string, email?: string): void {
  if (password.length < 10) {
    throw new PasswordTooWeakError("Password must be at least 10 characters.");
  }
  if (password.length > 200) {
    throw new PasswordTooWeakError("Password is too long.");
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new PasswordTooWeakError("Password must include at least one letter and one number.");
  }
  const lowered = password.toLowerCase();
  if (WEAK_EXACT.has(lowered)) {
    throw new PasswordTooWeakError("Choose a stronger password.");
  }
  if (email) {
    const local = normalizeEmail(email).split("@")[0] ?? "";
    if (local.length >= 4 && lowered.includes(local)) {
      throw new PasswordTooWeakError("Password must not contain the email name.");
    }
  }
}

function scryptOptions() {
  return { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM };
}

/**
 * Stored as `scrypt$N$r$p$salt$hash` so parameters are explicit per row.
 * Distinct from the PIN format `scrypt$salt$hash`.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scryptAsync(password, salt, SCRYPT_KEYLEN, scryptOptions());
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt" || !parts[4] || !parts[5]) {
    return false;
  }
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p) || N < 1024) {
    return false;
  }
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], "base64url");
    expected = Buffer.from(parts[5], "base64url");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;
  const actual = await scryptAsync(password, salt, expected.length, {
    N,
    r,
    p,
    maxmem: SCRYPT_MAXMEM,
  });
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function generateAdminSessionToken(): string {
  return `has_${randomBytes(32).toString("base64url")}`;
}
