// SPRINT-9: request-id helpers safe for Edge middleware (no node:crypto / async_hooks).
export const REQUEST_ID_HEADER = "x-request-id";

export function createRequestId(): string {
  return globalThis.crypto.randomUUID();
}

export function requestIdFromHeaders(request: Request): string {
  const existing = request.headers.get(REQUEST_ID_HEADER)?.trim();
  if (existing && existing.length >= 8 && existing.length <= 128) return existing;
  return createRequestId();
}
