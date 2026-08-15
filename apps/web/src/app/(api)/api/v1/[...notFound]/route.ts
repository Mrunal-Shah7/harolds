// SPRINT-2: catch-all for unknown /api/v1/* paths — standard error envelope (not framework HTML)
import { ApiErrorCode } from "@harolds/types";
import { fail } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  return fail(ApiErrorCode.NOT_FOUND, "Endpoint not found.");
}

export async function POST() {
  return fail(ApiErrorCode.NOT_FOUND, "Endpoint not found.");
}

export async function PUT() {
  return fail(ApiErrorCode.NOT_FOUND, "Endpoint not found.");
}

export async function PATCH() {
  return fail(ApiErrorCode.NOT_FOUND, "Endpoint not found.");
}

export async function DELETE() {
  return fail(ApiErrorCode.NOT_FOUND, "Endpoint not found.");
}
