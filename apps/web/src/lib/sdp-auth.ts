// SPRINT-5: Server Direct Print authentication — Digest (Epson-native) plus query/header for tests
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getPrinterConfig } from "@harolds/config";

const REALM = "ePOS-Print";

type NonceRow = { expiresAt: number };
const nonces = new Map<string, NonceRow>();

function sweepNonces(now = Date.now()): void {
  for (const [n, row] of nonces) {
    if (row.expiresAt <= now) nonces.delete(n);
  }
}

function issueNonce(): string {
  sweepNonces();
  const nonce = randomBytes(16).toString("hex");
  nonces.set(nonce, { expiresAt: Date.now() + 5 * 60_000 });
  return nonce;
}

export function digestUnauthorizedHeaders(): HeadersInit {
  const nonce = issueNonce();
  return {
    "WWW-Authenticate": `Digest realm="${REALM}", qop="auth", nonce="${nonce}", algorithm=MD5`,
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  };
}

function md5(s: string): string {
  return createHash("md5").update(s).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function parseDigest(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  const body = header.replace(/^Digest\s+/i, "");
  const re = /(\w+)=(?:"([^"]*)"|([^\s,]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    out[m[1]!] = m[2] ?? m[3] ?? "";
  }
  return out;
}

function digestMatches(args: {
  header: string;
  method: string;
  password: string;
}): boolean {
  const parts = parseDigest(args.header);
  const username = parts.username ?? "";
  const nonce = parts.nonce ?? "";
  const uri = parts.uri ?? "";
  const qop = parts.qop ?? "";
  const nc = parts.nc ?? "";
  const cnonce = parts.cnonce ?? "";
  const response = parts.response ?? "";
  if (!username || !nonce || !uri || !response) return false;
  const row = nonces.get(nonce);
  if (!row || row.expiresAt <= Date.now()) return false;

  const ha1 = md5(`${username}:${parts.realm ?? REALM}:${args.password}`);
  const ha2 = md5(`${args.method}:${uri}`);
  const expected =
    qop === "auth"
      ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
      : md5(`${ha1}:${nonce}:${ha2}`);
  return safeEqual(expected, response);
}

/**
 * True when the request carries the configured SDP secret in a form the printer can send:
 * Digest password, `?key=`, or `X-Print-Secret` (tests / curl).
 */
export function isSdpAuthenticated(request: Request): boolean {
  const secret = getPrinterConfig().sharedSecret;
  const url = new URL(request.url);
  const key = url.searchParams.get("key") ?? "";
  if (key && safeEqual(key, secret)) return true;

  const headerSecret = request.headers.get("x-print-secret") ?? "";
  if (headerSecret && safeEqual(headerSecret, secret)) return true;

  const auth = request.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("digest ")) {
    return digestMatches({ header: auth, method: request.method, password: secret });
  }
  return false;
}
