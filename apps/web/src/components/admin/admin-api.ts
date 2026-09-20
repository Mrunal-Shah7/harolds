// SPRINT-8: admin client fetch — credentials included; errors leave the screen usable.
export class AdminApiError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly status?: number,
    /** SPRINT-18: the error envelope's `details`, e.g. per-field validation messages. */
    public readonly details?: Record<string, unknown> | null,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

export async function adminApi<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  // FormData must keep the browser-set multipart boundary. Forcing application/json
  // makes request.formData() throw on the server (hero banner, category images, etc.).
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  if (init?.body && !headers.has("content-type") && !isFormData) {
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
    | { data?: T; error?: { code?: string; message?: string; details?: Record<string, unknown> | null } }
    | null;
  if (!res.ok) {
    throw new AdminApiError(
      json?.error?.message ?? `Request failed (${res.status}). The change was not saved.`,
      json?.error?.code,
      res.status,
      json?.error?.details ?? null,
    );
  }
  return json?.data as T;
}
