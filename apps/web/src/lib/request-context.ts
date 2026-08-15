// SPRINT-9: request id + AsyncLocalStorage so one request's logs and jobs share a correlation id.
import { AsyncLocalStorage } from "node:async_hooks";
import { requestIdFromHeaders } from "@/lib/request-id";

export { REQUEST_ID_HEADER, createRequestId, requestIdFromHeaders } from "@/lib/request-id";

type Store = { requestId: string };

const als = new AsyncLocalStorage<Store>();

export function getRequestId(): string | undefined {
  return als.getStore()?.requestId;
}

export function bindRequestId(request: Request): string {
  const requestId = requestIdFromHeaders(request);
  als.enterWith({ requestId });
  return requestId;
}
