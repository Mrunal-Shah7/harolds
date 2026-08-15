// SPRINT-9: client address behind a reverse proxy — never key limits on the proxy itself.
import { trustProxyEnabled } from "@harolds/config";

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-f:]+$/i;

function looksLikeIp(value: string): boolean {
  const v = value.trim();
  if (!v || v === "unknown") return false;
  if (IPV4.test(v)) return true;
  if (v.includes(":") && IPV6.test(v.replace(/^\[|\]$/g, ""))) return true;
  return false;
}

/**
 * When TRUST_PROXY is on, the left-most X-Forwarded-For hop is the client.
 * When it is off, forwarded headers are ignored so a caller cannot spoof the key.
 */
export function clientAddress(request: Request, trustProxy = trustProxyEnabled()): string {
  if (trustProxy) {
    const forwarded = request.headers.get("x-forwarded-for") ?? "";
    const first = forwarded.split(",")[0]?.trim() ?? "";
    if (looksLikeIp(first)) return first;
    const real = request.headers.get("x-real-ip")?.trim() ?? "";
    if (looksLikeIp(real)) return real;
  }
  return "direct";
}
