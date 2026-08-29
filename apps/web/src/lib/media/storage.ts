// SPRINT-12: local-disk image storage — writer, reader, and URL builder are the only places that know where bytes live.
/**
 * Images live on the server's local disk (not an object store). Production is a single
 * self-hosted box; an object store would add a vendor, credential, and egress path the
 * architecture has deliberately avoided. To move to object storage later, replace only:
 *   1. writeStoredImage (writer)
 *   2. readStoredImage (reader)
 *   3. buildMediaUrls (URL builder)
 * If a fourth call site learns the path layout, the abstraction is wrong.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile, access, readdir, unlink, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/** Max upload bytes — checked before the body is fully consumed. */
export const IMAGE_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;

/** Max decoded pixel dimension on either axis before we refuse to allocate. */
export const IMAGE_MAX_DIMENSION = 8_000;

/** Max decoded pixel count (width * height) before we refuse. */
export const IMAGE_MAX_PIXELS = 40_000_000;

/**
 * Derivative widths chosen from the storefront layout:
 * - thumb 128: item card is 64×64 CSS px → 2× retina
 * - modal 640: item modal hero on phone ~full width
 * - preview 320: admin / kitchen preview
 */
export const IMAGE_DERIVATIVES = {
  thumb: 128,
  modal: 640,
  preview: 320,
} as const;

export type ImageDerivativeName = keyof typeof IMAGE_DERIVATIVES;

/** Grace period before unreferenced bytes may be swept (7 days). */
export const IMAGE_RETENTION_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export type StoredImageFormat = "jpeg" | "png" | "webp";

export type MediaUrls = {
  /** Canonical original (re-encoded) URL */
  original: string;
  derivatives: {
    thumb: { webp: string; fallback: string };
    modal: { webp: string; fallback: string };
    preview: { webp: string; fallback: string };
  };
};

function defaultUploadDir(): string {
  // Outside build output and version control — under the monorepo root by default.
  return path.resolve(process.cwd(), process.env.IMAGE_UPLOAD_DIR ?? "../../data/uploads");
}

export function getUploadDir(): string {
  const configured = process.env.IMAGE_UPLOAD_DIR?.trim();
  if (configured) return path.resolve(configured);
  // When cwd is apps/web (Next), ../../data/uploads is repo-root/data/uploads.
  return defaultUploadDir();
}

export function assertSafeHash(hash: string): string {
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw new Error("Invalid media hash.");
  }
  return hash;
}

export function detectImageFormat(bytes: Buffer): StoredImageFormat | null {
  if (bytes.length < 12) return null;
  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  // PNG
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }
  // WebP: RIFF....WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

function extFor(format: StoredImageFormat): string {
  return format === "jpeg" ? "jpg" : format;
}

export function buildMediaUrls(hash: string): MediaUrls {
  const h = assertSafeHash(hash);
  const base = `/api/v1/media/${h}`;
  return {
    original: `${base}/original`,
    derivatives: {
      thumb: { webp: `${base}/thumb.webp`, fallback: `${base}/thumb` },
      modal: { webp: `${base}/modal.webp`, fallback: `${base}/modal` },
      preview: { webp: `${base}/preview.webp`, fallback: `${base}/preview` },
    },
  };
}

/** Extract content hash from a stored imageUrl (/api/v1/media/{hash}…). */
export function hashFromImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  const m = /^\/api\/v1\/media\/([a-f0-9]{64})(?:\/|$)/.exec(imageUrl);
  return m?.[1] ?? null;
}

export type WriteImageResult = {
  hash: string;
  format: StoredImageFormat;
  imageUrl: string;
  urls: MediaUrls;
};

/**
 * Decode → apply EXIF orientation → re-encode (strips metadata) → content-addressed store + derivatives.
 * Client filename and declared content-type are ignored.
 */
export async function writeStoredImage(input: Buffer): Promise<WriteImageResult> {
  const detected = detectImageFormat(input);
  if (!detected) {
    throw new Error("File is not a JPEG, PNG, or WebP image.");
  }

  const pipeline = sharp(input, {
    failOn: "error",
    limitInputPixels: IMAGE_MAX_PIXELS,
  }).rotate(); // apply orientation, then strip

  const meta = await pipeline.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width > IMAGE_MAX_DIMENSION || height > IMAGE_MAX_DIMENSION) {
    throw new Error(`Image dimensions exceed ${IMAGE_MAX_DIMENSION}px.`);
  }
  if (width * height > IMAGE_MAX_PIXELS) {
    throw new Error("Image pixel count is too large.");
  }

  // Re-encode original format (no EXIF) — never pass bytes through.
  let originalBuf: Buffer;
  let format: StoredImageFormat = detected;
  if (detected === "jpeg") {
    originalBuf = await sharp(input, { failOn: "error", limitInputPixels: IMAGE_MAX_PIXELS })
      .rotate()
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    format = "jpeg";
  } else if (detected === "png") {
    originalBuf = await sharp(input, { failOn: "error", limitInputPixels: IMAGE_MAX_PIXELS })
      .rotate()
      .png({ compressionLevel: 9 })
      .toBuffer();
    format = "png";
  } else {
    originalBuf = await sharp(input, { failOn: "error", limitInputPixels: IMAGE_MAX_PIXELS })
      .rotate()
      .webp({ quality: 85 })
      .toBuffer();
    format = "webp";
  }

  const hash = createHash("sha256").update(originalBuf).digest("hex");
  const dir = getUploadDir();
  await mkdir(dir, { recursive: true });

  const originalPath = path.join(dir, `${hash}.original.${extFor(format)}`);
  await writeFile(originalPath, originalBuf);

  // Also store a sidecar format marker so the reader can set Content-Type without sniffing only.
  await writeFile(path.join(dir, `${hash}.format`), format, "utf8");

  for (const [name, widthPx] of Object.entries(IMAGE_DERIVATIVES) as Array<[ImageDerivativeName, number]>) {
    const resized = sharp(originalBuf, { failOn: "error" }).resize({
      width: widthPx,
      height: widthPx,
      fit: "inside",
      withoutEnlargement: true,
    });
    const webpBuf = await resized.clone().webp({ quality: 80 }).toBuffer();
    const fallbackBuf =
      format === "png"
        ? await resized.clone().png().toBuffer()
        : await resized.clone().jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    await writeFile(path.join(dir, `${hash}.${name}.webp`), webpBuf);
    await writeFile(path.join(dir, `${hash}.${name}.${format === "png" ? "png" : "jpg"}`), fallbackBuf);
  }

  const urls = buildMediaUrls(hash);
  return {
    hash,
    format,
    imageUrl: urls.original.replace(/\/original$/, ""),
    urls,
  };
}

export type ReadImageResult = {
  bytes: Buffer;
  contentType: string;
  cacheControl: string;
};

function contentTypeFor(format: StoredImageFormat | "webp"): string {
  if (format === "jpeg") return "image/jpeg";
  if (format === "png") return "image/png";
  return "image/webp";
}

/**
 * Resolve a media path segment set to disk bytes. `variant` is original | thumb | modal | preview;
 * `preferWebp` selects the .webp derivative when available.
 */
export async function readStoredImage(args: {
  hash: string;
  variant: "original" | ImageDerivativeName;
  preferWebp?: boolean;
}): Promise<ReadImageResult | null> {
  const hash = assertSafeHash(args.hash);
  const dir = getUploadDir();
  let format: StoredImageFormat = "jpeg";
  try {
    const raw = await readFile(path.join(dir, `${hash}.format`), "utf8");
    if (raw === "jpeg" || raw === "png" || raw === "webp") format = raw;
  } catch {
    return null;
  }

  const cacheControl = "public, max-age=31536000, immutable";

  if (args.variant === "original") {
    const file = path.join(dir, `${hash}.original.${extFor(format)}`);
    try {
      const bytes = await readFile(file);
      return { bytes, contentType: contentTypeFor(format), cacheControl };
    } catch {
      return null;
    }
  }

  if (args.preferWebp) {
    try {
      const bytes = await readFile(path.join(dir, `${hash}.${args.variant}.webp`));
      return { bytes, contentType: "image/webp", cacheControl };
    } catch {
      // fall through
    }
  }

  const fallbackExt = format === "png" ? "png" : "jpg";
  try {
    const bytes = await readFile(path.join(dir, `${hash}.${args.variant}.${fallbackExt}`));
    return {
      bytes,
      contentType: contentTypeFor(format === "png" ? "png" : "jpeg"),
      cacheControl,
    };
  } catch {
    return null;
  }
}

export async function listStoredHashes(): Promise<string[]> {
  const dir = getUploadDir();
  try {
    await access(dir);
  } catch {
    return [];
  }
  const names = await readdir(dir);
  const hashes = new Set<string>();
  for (const name of names) {
    const m = /^([a-f0-9]{64})\.format$/.exec(name);
    if (m) hashes.add(m[1]!);
  }
  return [...hashes];
}

/** Delete files for hashes older than the grace period that are not in `referenced`. */
export async function sweepUnreferencedImages(referenced: Set<string>, now = Date.now()): Promise<number> {
  const dir = getUploadDir();
  const hashes = await listStoredHashes();
  let removed = 0;
  for (const hash of hashes) {
    if (referenced.has(hash)) continue;
    const formatPath = path.join(dir, `${hash}.format`);
    try {
      const st = await stat(formatPath);
      if (now - st.mtimeMs < IMAGE_RETENTION_GRACE_MS) continue;
      const files = (await readdir(dir)).filter((n) => n.startsWith(`${hash}.`));
      for (const f of files) {
        await unlink(path.join(dir, f));
      }
      removed += 1;
    } catch {
      // ignore
    }
  }
  return removed;
}
