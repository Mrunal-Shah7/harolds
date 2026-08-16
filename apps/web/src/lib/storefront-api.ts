// Storefront-only browser/server fetch helpers for the public v1 API.
// Talks exclusively to /api/v1/* per docs/API-CONTRACT-HANDOFF.md — never @harolds/db.
import type {
  ApiErrorResponse,
  ApiSuccess,
  CartRequest,
  CheckoutOrderResponse,
  CreateOrderRequest,
  FullMenu,
  MenuItemDetail,
  PublicOrderStatusResponse,
  QuoteResult,
  StoreStatus,
} from "@harolds/types";

export class StorefrontApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = "StorefrontApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const body = (await res.json().catch(() => null)) as ApiSuccess<T> | ApiErrorResponse | null;
  if (!res.ok || !body || "error" in body) {
    const err = body && "error" in body ? body.error : null;
    throw new StorefrontApiError(
      err?.code ?? "INTERNAL_ERROR",
      err?.message ?? "Something went wrong. Please try again.",
      res.status,
      err?.details ?? null,
    );
  }
  return (body as ApiSuccess<T>).data;
}

export function getFullMenu(): Promise<FullMenu> {
  return request<FullMenu>("/api/v1/menu", { cache: "no-store" });
}

export function getMenuItem(id: string): Promise<MenuItemDetail> {
  return request<MenuItemDetail>(`/api/v1/menu/items/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
}

export function getStoreStatus(): Promise<StoreStatus> {
  return request<StoreStatus>("/api/v1/store/status", { cache: "no-store" });
}

export function getQuote(cart: CartRequest): Promise<QuoteResult> {
  return request<QuoteResult>("/api/v1/quote", {
    method: "POST",
    body: JSON.stringify(cart),
  });
}

export function createOrder(order: CreateOrderRequest): Promise<CheckoutOrderResponse> {
  return request<CheckoutOrderResponse>("/api/v1/orders", {
    method: "POST",
    body: JSON.stringify(order),
  });
}

export function getOrderStatus(lookupToken: string): Promise<PublicOrderStatusResponse> {
  return request<PublicOrderStatusResponse>(
    `/api/v1/orders/status/${encodeURIComponent(lookupToken)}`,
    { cache: "no-store" },
  );
}

export function isAvailabilityReason(reason: { isAvailability: boolean }): boolean {
  return reason.isAvailability;
}
