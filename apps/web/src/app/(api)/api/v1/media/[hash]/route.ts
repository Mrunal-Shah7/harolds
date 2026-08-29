// SPRINT-12: GET /api/v1/media/[hash] — canonical original image URL stored on MenuItem.imageUrl.
import { NextResponse } from "next/server";
import { readStoredImage } from "@/lib/media/storage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request: Request, ctx: { params: Promise<{ hash: string }> }) {
  const { hash } = await ctx.params;
  const result = await readStoredImage({ hash, variant: "original" });
  if (!result) {
    return new NextResponse("Not found", { status: 404 });
  }
  return new NextResponse(new Uint8Array(result.bytes), {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": result.cacheControl,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
