// SPRINT-6: kitchen display fetch helpers — Bearer session, distinct auth errors.
import type { KitchenQueueOrder, KitchenQueueResponse, KitchenStaffPublic } from "@harolds/types";
import { KitchenErrorCode } from "@harolds/types";

export class KitchenApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = "KitchenApiError";
  }

  get isAuthFailure(): boolean {
    return (
      this.code === KitchenErrorCode.SESSION_REQUIRED ||
      this.code === KitchenErrorCode.SESSION_EXPIRED ||
      this.code === KitchenErrorCode.SESSION_REVOKED ||
      this.code === KitchenErrorCode.ACCOUNT_DISABLED
    );
  }
}

type Envelope<T> = {
  data?: T;
  error?: { code: string; message: string; details: Record<string, unknown> | null };
};

async function kitchenFetch<T>(path: string, token: string | null, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  if (init?.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(path, { ...init, headers, cache: "no-store" });
  const body = (await res.json()) as Envelope<T>;
  if (!res.ok || body.error) {
    throw new KitchenApiError(
      body.error?.code ?? "UNKNOWN",
      body.error?.message ?? `Request failed (${res.status})`,
      body.error?.details ?? null,
    );
  }
  if (body.data === undefined) {
    throw new KitchenApiError("UNKNOWN", "Empty kitchen response.");
  }
  return body.data;
}

export async function fetchRoster(): Promise<KitchenStaffPublic[]> {
  const data = await kitchenFetch<{ staff: KitchenStaffPublic[] }>(
    "/api/internal/kitchen/auth/roster",
    null,
  );
  return data.staff;
}

export async function signIn(userId: string, pin: string) {
  return kitchenFetch<{
    token: string;
    expiresAt: string;
    user: KitchenStaffPublic;
  }>("/api/internal/kitchen/auth/signin", null, {
    method: "POST",
    body: JSON.stringify({ userId, pin }),
  });
}

export async function fetchSession(token: string) {
  return kitchenFetch<{
    user: KitchenStaffPublic & { sessionExpiresAt: string };
  }>("/api/internal/kitchen/auth/session", token);
}

export async function signOut(token: string): Promise<void> {
  await kitchenFetch<{ ok: boolean }>("/api/internal/kitchen/auth/signout", token, { method: "POST" });
}

export async function fetchQueue(token: string): Promise<KitchenQueueResponse> {
  return kitchenFetch<KitchenQueueResponse>("/api/internal/kitchen/queue", token);
}

export async function fetchOrder(token: string, id: string): Promise<KitchenQueueOrder> {
  const data = await kitchenFetch<{ order: KitchenQueueOrder }>(
    `/api/internal/kitchen/orders/${id}`,
    token,
  );
  return data.order;
}

export async function transitionOrder(token: string, id: string, to: string): Promise<void> {
  await kitchenFetch(`/api/internal/kitchen/orders/${id}/transition`, token, {
    method: "POST",
    body: JSON.stringify({ to }),
  });
}
