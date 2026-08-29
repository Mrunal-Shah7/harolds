// SPRINT-12: GET /api/v1/media/[hash]/[variant] — content-addressed images with immutable cache.
import { NextResponse } from "next/server";
import { readStoredImage, type ImageDerivativeName } from "@/lib/media/storage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VARIANTS = new Set(["original", "thumb", "modal", "preview"]);

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ hash: string; variant: string }> },
) {
  const { hash, variant: rawVariant } = await ctx.params;
  let preferWebp = false;
  let variant = rawVariant;
  if (rawVariant.endsWith(".webp")) {
    preferWebp = true;
    variant = rawVariant.slice(0, -".webp".length);
  }
  if (!VARIANTS.has(variant)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const result = await readStoredImage({
    hash,
    variant: variant as "original" | ImageDerivativeName,
    preferWebp,
  });
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
