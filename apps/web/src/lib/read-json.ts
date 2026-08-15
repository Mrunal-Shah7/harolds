// SPRINT-9: JSON body bound before parse; malformed JSON is a validation error, never a 500.
import { BODY_LIMITS } from "@harolds/config";
import { AdminErrorCode, ApiErrorCode, KitchenErrorCode } from "@harolds/types";
import { NextResponse } from "next/server";
import { adminFail } from "@/lib/admin-http";
import { fail } from "@/lib/api";
import { kitchenFail } from "@/lib/kitchen-http";

export type JsonReadResult =
  | { ok: true; value: unknown }
  | { ok: false; response: NextResponse };

function tooLarge(kind: "public" | "admin" | "kitchen", maxBytes: number): NextResponse {
  const details = { maxBytes };
  if (kind === "admin") {
    return adminFail(AdminErrorCode.VALIDATION_ERROR, "Request body is too large.", details);
  }
  if (kind === "kitchen") {
    return kitchenFail(KitchenErrorCode.VALIDATION_ERROR, "Request body is too large.", details);
  }
  return fail(ApiErrorCode.VALIDATION_ERROR, "Request body is too large.", details);
}

function malformed(kind: "public" | "admin" | "kitchen"): NextResponse {
  if (kind === "admin") {
    return adminFail(AdminErrorCode.VALIDATION_ERROR, "Request body must be JSON.");
  }
  if (kind === "kitchen") {
    return kitchenFail(KitchenErrorCode.VALIDATION_ERROR, "Request body must be JSON.");
  }
  return fail(ApiErrorCode.VALIDATION_ERROR, "Request body must be JSON.", {
    reasons: [{ code: "MALFORMED_BODY", message: "Request body must be valid JSON." }],
  });
}

export async function readBoundedJson(
  request: Request,
  args: { maxBytes?: number; kind?: "public" | "admin" | "kitchen" } = {},
): Promise<JsonReadResult> {
  const maxBytes = args.maxBytes ?? BODY_LIMITS.jsonPublicBytes;
  const kind = args.kind ?? "public";
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, response: tooLarge(kind, maxBytes) };
  }
  const raw = await request.text();
  if (raw.length > maxBytes) {
    return { ok: false, response: tooLarge(kind, maxBytes) };
  }
  if (raw.length === 0) {
    return { ok: false, response: malformed(kind) };
  }
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false, response: malformed(kind) };
  }
}

export { BODY_LIMITS };
