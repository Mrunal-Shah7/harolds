// POST/DELETE /api/internal/admin/store/hero-image — the storefront hero's background.
//
// Same shape as the menu-item and category image routes. The image is stored content-addressed
// and referenced from StoreConfig.heroImageUrl; DELETE detaches without removing bytes, which
// the retention sweeper handles.
import { updateStoreConfig } from "@harolds/db";
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

void BODY_LIMITS;

export async function POST(request: Request) {
  try {
    const session = await requireAdmin(request);

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

    await updateStoreConfig(
      { heroImageUrl: stored.imageUrl },
      { userId: session.userId, role: session.role },
    );
    return adminOk({ heroImageUrl: stored.imageUrl, urls: stored.urls, hash: stored.hash });
  } catch (err) {
    return adminAuthError(err);
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireAdmin(request);
    await updateStoreConfig(
      { heroImageUrl: null },
      { userId: session.userId, role: session.role },
    );
    return adminOk({ heroImageUrl: null });
  } catch (err) {
    return adminAuthError(err);
  }
}
