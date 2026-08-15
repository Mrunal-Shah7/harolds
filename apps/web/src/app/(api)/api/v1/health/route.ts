// SPRINT-4 / SPRINT-9: GET /api/v1/health — Square env plus database and worker dependency checks
import { handleRouteError, ok } from "@/lib/api";
import { getHealthSnapshot } from "@/lib/health";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const snapshot = await getHealthSnapshot();
    if (!snapshot.ok) {
      return NextResponse.json(
        { data: snapshot, meta: { serverTime: new Date().toISOString(), version: "1.2.0" } },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return ok(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return handleRouteError(err);
  }
}
