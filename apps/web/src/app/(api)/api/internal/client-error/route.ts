// SPRINT-9: POST /api/internal/client-error — browser errors, redacted, rate limited.
import { BODY_LIMITS } from "@harolds/config";
import { captureException } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/enforce-rate-limit";
import { readBoundedJson } from "@/lib/read-json";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "clientError");
  if (limited) return limited;
  const parsed = await readBoundedJson(request, { maxBytes: BODY_LIMITS.jsonPublicBytes, kind: "public" });
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as { message?: unknown; source?: unknown };
  const message = typeof body.message === "string" ? body.message.slice(0, 500) : "browser error";
  const source = typeof body.source === "string" ? body.source.slice(0, 80) : "browser";
  await captureException(new Error(message), { surface: "browser", source });
  return NextResponse.json({ ok: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
