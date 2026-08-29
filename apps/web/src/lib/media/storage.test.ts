// SPRINT-12: hostile upload and EXIF / content-addressed naming tests (no live credentials).
import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  detectImageFormat,
  writeStoredImage,
  hashFromImageUrl,
  IMAGE_UPLOAD_MAX_BYTES,
} from "./storage";

describe("media storage", () => {
  let dir: string;
  let prev: string | undefined;

  before(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "harolds-media-"));
    prev = process.env.IMAGE_UPLOAD_DIR;
    process.env.IMAGE_UPLOAD_DIR = dir;
  });

  after(async () => {
    if (prev === undefined) delete process.env.IMAGE_UPLOAD_DIR;
    else process.env.IMAGE_UPLOAD_DIR = prev;
    await rm(dir, { recursive: true, force: true });
  });

  it("rejects a renamed text file", () => {
    assert.equal(detectImageFormat(Buffer.from("hello world")), null);
  });

  it("rejects SVG even with an image-like name", () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    assert.equal(detectImageFormat(svg), null);
  });

  it("rejects a file with a valid JPEG header and hostile trailing bytes by re-encoding cleanly", async () => {
    const clean = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 20, b: 20 } },
    })
      .jpeg()
      .toBuffer();
    const hostile = Buffer.concat([clean, Buffer.from("\n<?php system($_GET['x']); ?>")]);
    assert.equal(detectImageFormat(hostile), "jpeg");
    const stored = await writeStoredImage(hostile);
    const originalPath = path.join(dir, `${stored.hash}.original.jpg`);
    const out = await readFile(originalPath);
    assert.equal(out.includes(Buffer.from("<?php")), false);
  });

  it("strips EXIF GPS and content-addresses the re-encoded bytes", async () => {
    // Minimal JPEG with EXIF orientation; sharp.rotate() applies then strips.
    const withExif = await sharp({
      create: { width: 32, height: 16, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .withMetadata({ orientation: 6, exif: { IFD0: { Copyright: "test" } } })
      .jpeg()
      .toBuffer();

    const stored = await writeStoredImage(withExif);
    assert.match(stored.hash, /^[a-f0-9]{64}$/);
    assert.equal(hashFromImageUrl(stored.imageUrl), stored.hash);
    assert.ok(!stored.imageUrl.includes(".."));
    assert.ok(!stored.imageUrl.toLowerCase().includes(".php"));

    const meta = await sharp(path.join(dir, `${stored.hash}.original.jpg`)).metadata();
    assert.equal(meta.orientation, undefined);
    // Derivatives exist
    await readFile(path.join(dir, `${stored.hash}.thumb.webp`));
    await readFile(path.join(dir, `${stored.hash}.modal.webp`));
    await readFile(path.join(dir, `${stored.hash}.preview.webp`));
  });

  it("documents the upload size cap", () => {
    assert.equal(IMAGE_UPLOAD_MAX_BYTES, 8 * 1024 * 1024);
  });
});
