// POST/DELETE /api/internal/admin/menu/categories/[id]/image — the storefront rail tile.
//
// Deliberately the same shape as the menu-item image route: same size ceiling, same magic-byte
// sniff, same content-addressed write, same detach-only DELETE. A second upload mechanism would
// be a second set of limits to keep in step.
import { updateCategory } from "@harolds/db";
import { BODY_LIMITS } from "@harolds/config";
import { AdminErrorCode } from "@harolds/types";
import { requireAdmin } from "@/lib/admin-auth";
import { adminAuthError, adminFail, adminOk } from "@/lib/admin-http";
import {
  IMAGE_UPLOAD_MAX_BYTES,
  writeStoredImage,
  detectImageFormat,
} from "@/lib/media/storage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Extend body limit for multipart — size still checked before full consume via Content-Length.
void BODY_LIMITS;

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdmin(request);
    const { id } = await ctx.params;

    const declared = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > IMAGE_UPLOAD_MAX_BYTES + 64 * 1024) {
      return adminFail(AdminErrorCode.VALIDATION_ERROR, "Upload is too large.", {
        maxBytes: IMAGE_UPLOAD_MAX_BYTES,
      });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return adminFail(AdminErrorCode.VALIDATION_ERROR, 'Expected multipart field "file".');
    }
    if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
      return adminFail(AdminErrorCode.VALIDATION_ERROR, "Upload is too large.", {
        maxBytes: IMAGE_UPLOAD_MAX_BYTES,
      });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.byteLength > IMAGE_UPLOAD_MAX_BYTES) {
      return adminFail(AdminErrorCode.VALIDATION_ERROR, "Upload is too large.", {
        maxBytes: IMAGE_UPLOAD_MAX_BYTES,
      });
    }
    if (!detectImageFormat(buf)) {
      return adminFail(
        AdminErrorCode.VALIDATION_ERROR,
        "File content is not a JPEG, PNG, or WebP image.",
      );
    }

    let stored;
    try {
      stored = await writeStoredImage(buf);
    } catch (err) {
      return adminFail(
        AdminErrorCode.VALIDATION_ERROR,
        err instanceof Error ? err.message : "Could not process image.",
      );
    }

    const row = await updateCategory(id, { imageUrl: stored.imageUrl }, session.userId);
    return adminOk({ category: row, urls: stored.urls, hash: stored.hash });
  } catch (err) {
    return adminAuthError(err);
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdmin(request);
    const { id } = await ctx.params;
    // Detach only — bytes remain until the retention sweeper.
    const row = await updateCategory(id, { imageUrl: null }, session.userId);
    return adminOk({ category: row });
  } catch (err) {
    return adminAuthError(err);
  }
}
