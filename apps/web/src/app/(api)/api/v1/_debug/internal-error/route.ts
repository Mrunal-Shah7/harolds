// SPRINT-2: GET /api/v1/_debug/internal-error — Phase 2 gate: generic INTERNAL_ERROR envelope
// Only available when NODE_ENV !== production
import { ApiErrorCode } from "@harolds/types";
import { fail } from "@/lib/api";
import { captureException } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return fail(ApiErrorCode.NOT_FOUND, "Endpoint not found.");
  }
  void captureException(new Error("deliberate internal error"), { surface: "api", deliberate: true });
  return fail(ApiErrorCode.INTERNAL_ERROR, "An unexpected error occurred.");
}
