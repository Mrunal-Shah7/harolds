// SPRINT-11: every body-accepting route must use the bounded reader, not request.json().
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../app/(api)");

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (name === "route.ts") acc.push(full);
  }
  return acc;
}

describe("bounded body reader enumeration", () => {
  it("no API route parses JSON via request.json()", () => {
    const files = walk(apiRoot);
    assert.ok(files.length > 20, "expected to find route files");
    const offenders = files
      .filter((file) => readFileSync(file, "utf8").includes("request.json()"))
      .map((file) => path.relative(apiRoot, file).replaceAll("\\", "/"));
    assert.deepEqual(offenders, []);
  });

  it("admin JSON body routes use readAdminJson", () => {
    const files = walk(path.join(apiRoot, "api/internal/admin"));
    const withReader = files.filter((file) => readFileSync(file, "utf8").includes("readAdminJson") || readFileSync(file, "utf8").includes("readBoundedJson"));
    assert.ok(withReader.length >= 24, `expected >= 24 admin body readers, found ${withReader.length}`);
  });
});
