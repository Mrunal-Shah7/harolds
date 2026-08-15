// SPRINT-8: admin client fetch — credentials included; errors leave the screen usable.
export class AdminApiError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

export async function adminApi<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(path, {
    credentials: "include",
    ...init,
    headers,
  });
  if (res.headers.get("content-type")?.includes("text/csv")) {
    const text = await res.text();
    if (!res.ok) throw new AdminApiError(text || `Request failed (${res.status})`, undefined, res.status);
    return text as T;
  }
  const json = (await res.json().catch(() => null)) as
    | { data?: T; error?: { code?: string; message?: string } }
    | null;
  if (!res.ok) {
    throw new AdminApiError(
      json?.error?.message ?? `Request failed (${res.status}). The change was not saved.`,
      json?.error?.code,
      res.status,
    );
  }
  return json?.data as T;
}
