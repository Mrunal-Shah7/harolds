#!/usr/bin/env node
// SPRINT-13: restore drill — backup DB + images, restore into a scratch DB and
// scratch image directory, verify every attached image resolves at every derivative,
// and record wall-clock duration.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  existsSync,
  cpSync,
  mkdirSync,
  rmSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const sharp = require(path.join(root, "node_modules/sharp"));

const PG_BIN = process.env.PG_BIN || "C:\\Program Files\\PostgreSQL\\18\\bin";
function bin(name) {
  const win = path.join(PG_BIN, `${name}.exe`);
  if (existsSync(win)) return win;
  return name;
}

function run(cmd, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", env });
    child.on("exit", (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`${cmd} exited ${code}`));
    });
  });
}

function pgParts(rawUrl) {
  const parsed = new URL(rawUrl.replace(/^postgresql:/i, "http:"));
  parsed.searchParams.delete("schema");
  return {
    host: parsed.hostname,
    port: parsed.port || "5432",
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ""),
    uriWithoutDb: `postgresql://${parsed.username}:${parsed.password}@${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`,
  };
}

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) {
  console.error("DATABASE_URL is required (node --env-file=.env)");
  process.exit(1);
}

const parts = pgParts(rawUrl);
const uploadDir = process.env.IMAGE_UPLOAD_DIR
  ? path.resolve(process.env.IMAGE_UPLOAD_DIR)
  : path.join(root, "data", "uploads");
const scratchDb = process.env.SPRINT13_RESTORE_DB || "harolds_sprint13_restore";
const scratchImages = path.join(root, "data", "uploads-sprint13-restore");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = process.env.BACKUP_DIR || path.join(root, "backups");
mkdirSync(backupDir, { recursive: true });
mkdirSync(uploadDir, { recursive: true });

if (/^harolds$/i.test(scratchDb)) {
  console.error("Refusing to restore onto the live database name.");
  process.exit(1);
}

const wallStart = Date.now();
const pgEnv = { ...process.env, PGPASSWORD: parts.password };

// --- Plant a probe image and attach it to a seeded item ---
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const originalBuf = await sharp(png).png({ compressionLevel: 9 }).toBuffer();
const hash = createHash("sha256").update(originalBuf).digest("hex");
writeFileSync(path.join(uploadDir, `${hash}.original.png`), originalBuf);
writeFileSync(path.join(uploadDir, `${hash}.format`), "png", "utf8");
for (const [name, widthPx] of [
  ["thumb", 128],
  ["modal", 640],
  ["preview", 320],
]) {
  const resized = sharp(originalBuf).resize({
    width: widthPx,
    height: widthPx,
    fit: "inside",
    withoutEnlargement: true,
  });
  writeFileSync(path.join(uploadDir, `${hash}.${name}.webp`), await resized.clone().webp({ quality: 80 }).toBuffer());
  writeFileSync(path.join(uploadDir, `${hash}.${name}.png`), await resized.clone().png().toBuffer());
}

// Stored canonical form matches writeStoredImage: /api/v1/media/{hash} (no /original).
const imageUrl = `/api/v1/media/${hash}`;
const attachSql = `
WITH picked AS (
  SELECT id, "imageUrl" AS prior
  FROM "MenuItem"
  WHERE "workbookId" LIKE 'itm_%' AND "isActive" = true
  ORDER BY "sortOrder" ASC
  LIMIT 1
)
UPDATE "MenuItem" m
SET "imageUrl" = '${imageUrl}'
FROM picked
WHERE m.id = picked.id
RETURNING m.id, picked.prior;
`;
const attach = spawnSync(
  bin("psql"),
  ["-h", parts.host, "-p", parts.port, "-U", parts.user, "-d", parts.database, "-t", "-A", "-c", attachSql],
  { env: pgEnv, encoding: "utf8" },
);
if (attach.status !== 0) {
  console.error(attach.stderr || attach.stdout);
  process.exit(1);
}
const [itemId, priorUrl] = (attach.stdout || "").trim().split("|");
if (!itemId) {
  console.error("Could not attach probe image to a seeded menu item.");
  process.exit(1);
}
console.log(`planted image on item ${itemId} hash=${hash}`);

// --- Backup ---
const dumpFile = path.join(backupDir, `harolds-sprint13-${stamp}.dump`);
const imagesBackup = path.join(backupDir, `harolds-images-sprint13-${stamp}`);
await run(
  bin("pg_dump"),
  ["--format=custom", "--no-owner", "--file", dumpFile, `${parts.uriWithoutDb}/${parts.database}`],
  pgEnv,
);
cpSync(uploadDir, imagesBackup, { recursive: true });
console.log(`backup dump ${dumpFile}`);
console.log(`backup images ${imagesBackup}`);

// --- Destroy scratch and restore ---
const restoreStart = Date.now();
await run(bin("dropdb"), ["--if-exists", "-h", parts.host, "-p", parts.port, "-U", parts.user, scratchDb], pgEnv);
await run(bin("createdb"), ["-h", parts.host, "-p", parts.port, "-U", parts.user, scratchDb], pgEnv);
await run(bin("pg_restore"), ["--no-owner", "--dbname", `${parts.uriWithoutDb}/${scratchDb}`, dumpFile], pgEnv);

if (existsSync(scratchImages)) rmSync(scratchImages, { recursive: true, force: true });
mkdirSync(path.dirname(scratchImages), { recursive: true });
cpSync(imagesBackup, scratchImages, { recursive: true });
const restoreMs = Date.now() - restoreStart;
const totalMs = Date.now() - wallStart;

// --- Verify ---
const verify = spawnSync(
  bin("psql"),
  [
    "-h",
    parts.host,
    "-p",
    parts.port,
    "-U",
    parts.user,
    "-d",
    scratchDb,
    "-t",
    "-A",
    "-c",
    `SELECT COUNT(*) FILTER (WHERE "imageUrl" IS NOT NULL)::text, COUNT(*)::text FROM "MenuItem" WHERE "isActive" = true;`,
  ],
  { env: pgEnv, encoding: "utf8" },
);
const [withImage, total] = (verify.stdout || "").trim().split("|");
console.log(`scratch DB active items=${total} with_image=${withImage}`);

const urls = spawnSync(
  bin("psql"),
  [
    "-h",
    parts.host,
    "-p",
    parts.port,
    "-U",
    parts.user,
    "-d",
    scratchDb,
    "-t",
    "-A",
    "-c",
    `SELECT "imageUrl" FROM "MenuItem" WHERE "imageUrl" IS NOT NULL;`,
  ],
  { env: pgEnv, encoding: "utf8" },
);
const imageUrls = (urls.stdout || "")
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

let broken = 0;
const files = readdirSync(scratchImages);
for (const url of imageUrls) {
  const m = /^\/api\/v1\/media\/([a-f0-9]{64})/.exec(url);
  if (!m) {
    console.error(`FAIL unparseable imageUrl ${url}`);
    broken += 1;
    continue;
  }
  const h = m[1];
  const hasOriginal = files.some((f) => f.startsWith(`${h}.original.`));
  const hasThumb =
    files.includes(`${h}.thumb.webp`) &&
    (files.includes(`${h}.thumb.png`) || files.includes(`${h}.thumb.jpg`));
  const hasModal =
    files.includes(`${h}.modal.webp`) &&
    (files.includes(`${h}.modal.png`) || files.includes(`${h}.modal.jpg`));
  const hasPreview =
    files.includes(`${h}.preview.webp`) &&
    (files.includes(`${h}.preview.png`) || files.includes(`${h}.preview.jpg`));
  if (!hasOriginal || !hasThumb || !hasModal || !hasPreview || !files.includes(`${h}.format`)) {
    console.error(
      `FAIL derivatives missing for ${h} original=${hasOriginal} thumb=${hasThumb} modal=${hasModal} preview=${hasPreview}`,
    );
    broken += 1;
  } else {
    console.log(`ok image ${h} all derivatives present in restored directory`);
  }
}

// Cleanup live DB probe attachment
const prior = priorUrl && priorUrl !== "" ? `'${priorUrl.replace(/'/g, "''")}'` : "NULL";
spawnSync(
  bin("psql"),
  [
    "-h",
    parts.host,
    "-p",
    parts.port,
    "-U",
    parts.user,
    "-d",
    parts.database,
    "-c",
    `UPDATE "MenuItem" SET "imageUrl" = ${prior} WHERE id = '${itemId}';`,
  ],
  { env: pgEnv, encoding: "utf8" },
);

const summary = {
  restoreDurationMs: restoreMs,
  wallClockMs: totalMs,
  scratchDb,
  scratchImages,
  dumpFile,
  imagesBackup,
  attachedItemId: itemId,
  probeHash: hash,
  imageUrlsChecked: imageUrls.length,
  broken,
};
writeFileSync(path.join(backupDir, `sprint13-restore-drill-${stamp}.json`), JSON.stringify(summary, null, 2));
console.log(`RESTORE_DURATION_MS=${restoreMs}`);
console.log(`WALL_CLOCK_MS=${totalMs}`);
console.log(JSON.stringify(summary, null, 2));

if (broken > 0 || Number(withImage) < 1) {
  console.error("sprint13-restore-drill FAILED");
  process.exit(1);
}
console.log("sprint13-restore-drill passed");
