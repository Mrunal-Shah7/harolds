// SPRINT-6: generate kitchen PWA PNG icons (no image toolchain).
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function png(size: number): Buffer {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const inH =
        x > size * 0.28 &&
        x < size * 0.72 &&
        y > size * 0.22 &&
        y < size * 0.78 &&
        (x < size * 0.42 || x > size * 0.58 || (y > size * 0.42 && y < size * 0.58));
      const i = row + 1 + x * 3;
      if (inH) {
        raw[i] = 18;
        raw[i + 1] = 16;
        raw[i + 2] = 12;
      } else {
        raw[i] = 245;
        raw[i + 1] = 197;
        raw[i + 2] = 24;
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../public/kitchen");
mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, "icon-192.png"), png(192));
writeFileSync(path.join(dir, "icon-512.png"), png(512));
console.log("wrote kitchen PWA icons");
