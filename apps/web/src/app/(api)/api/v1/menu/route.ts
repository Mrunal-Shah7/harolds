// SPRINT-2: GET /api/v1/menu — full catalogue (cached + ETag). No pagination.
import { getCachedFullMenu } from "@harolds/db";
import { handleRouteError, ok } from "@/lib/api";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/enforce-rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const limited = enforceRateLimit(request, "menu");
    if (limited) return limited;
    const { menu, etag } = await getCachedFullMenu();
    const ifNoneMatch = request.headers.get("if-none-match");
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": "no-cache, must-revalidate",
        },
      });
    }

    return ok(menu, {
      headers: {
        ETag: etag,
        "Cache-Control": "no-cache, must-revalidate",
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
