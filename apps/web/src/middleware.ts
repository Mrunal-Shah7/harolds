// SPRINT-9: browser + API security headers, request id, HTTPS hint. Rate limits stay in Node handlers.
import { NextResponse, type NextRequest } from "next/server";
import { browserSecurityHeaders, trustProxyEnabled } from "@harolds/config";
import { REQUEST_ID_HEADER, requestIdFromHeaders } from "@/lib/request-id";

export function middleware(request: NextRequest): NextResponse {
  const requestId = requestIdFromHeaders(request);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const isHttps = forwardedProto === "https" || (forwardedProto == null && request.nextUrl.protocol === "https:");
  const isProduction = process.env.NODE_ENV === "production";

  // Only when a reverse proxy is trusted: Node itself speaks HTTP to nginx.
  // next start on localhost injects X-Forwarded-Proto: http; redirecting that breaks local production.
  if (isProduction && trustProxyEnabled() && forwardedProto === "http") {
    const redirect = request.nextUrl.clone();
    redirect.protocol = "https:";
    const response = NextResponse.redirect(redirect, 308);
    response.headers.set(REQUEST_ID_HEADER, requestId);
    return response;
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  for (const [key, value] of Object.entries(browserSecurityHeaders({ isHttps, isProduction }))) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|kitchen/icon-).*)"],
};
