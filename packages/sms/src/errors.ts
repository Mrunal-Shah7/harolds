// SPRINT-7: Twilio error classification — permanent vs transient.
const PERMANENT_CODES = new Set([
  "21211", // invalid To
  "21214",
  "21408",
  "21612",
  "21614", // not a mobile
  "21610", // unsubscribed
  "21604",
  "21217",
  "20003",
  "20404",
]);

export function classifyTwilioError(err: unknown): {
  kind: "rejected" | "transport_failure";
  code: string;
  message: string;
} {
  const anyErr = err as {
    status?: number;
    code?: number | string;
    message?: string;
    moreInfo?: string;
  };
  const code = String(anyErr.code ?? anyErr.status ?? "");
  const message = typeof anyErr.message === "string" ? anyErr.message : "SMS send failed";
  const http = anyErr.status;
  if (PERMANENT_CODES.has(code) || http === 400 || http === 404) {
    return { kind: "rejected", code: code || "permanent", message };
  }
  return { kind: "transport_failure", code: code || "transport", message };
}

export function isUnsubscribedCode(code: string): boolean {
  return code === "21610";
}
