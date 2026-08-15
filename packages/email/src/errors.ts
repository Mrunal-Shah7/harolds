// SPRINT-7: Resend error classification — permanent vs transient.
export function classifyResendError(err: unknown): {
  kind: "rejected" | "transport_failure";
  code: string;
  message: string;
} {
  const anyErr = err as {
    statusCode?: number;
    status?: number;
    name?: string;
    message?: string;
  };
  const status = anyErr.statusCode ?? anyErr.status;
  const message = typeof anyErr.message === "string" ? anyErr.message : "Email send failed";
  const code = String(status ?? anyErr.name ?? "email");
  if (status === 400 || status === 403 || status === 404 || status === 409 || status === 422) {
    return { kind: "rejected", code, message };
  }
  return { kind: "transport_failure", code, message };
}

export function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) && value.trim().length <= 254;
}
