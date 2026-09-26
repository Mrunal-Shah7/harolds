// SPRINT-19: the Apple Pay domain association file must be the bytes the operator downloaded from
// the Merchant Pay Connect portal, exactly. Apple's verifier compares them; a line-ending rewrite
// fails verification with no useful error. The served response is checked by
// scripts/sprint19-wallet-e2e.ts against a running build.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { execFileSync } from "node:child_process";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rootDir = path.resolve(webDir, "../..");
const REL = "apps/web/public/.well-known/apple-developer-merchantid-domain-association";

/** Recorded in Sprint 19 Phase 0 from the file as the operator placed it (docs/SPRINT-19-NOTES.md §0.7). */
const ASSOCIATION_SHA256 = "6e6bea7f8889670155ec616394f08cff3c782e170f76db38c89ffdfe19107d51";
const ASSOCIATION_BYTES = 228;

describe("Apple Pay domain association file", () => {
  it("is byte-identical to the Phase 0 record", () => {
    const bytes = readFileSync(path.join(rootDir, REL));
    assert.equal(bytes.length, ASSOCIATION_BYTES);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), ASSOCIATION_SHA256);
    assert.equal(bytes.includes(0x0d), false, "no CR byte");
  });

  it("has no extension and no stray sibling (a hidden .txt is the classic failure)", () => {
    const names = readdirSync(path.join(webDir, "public/.well-known"));
    assert.deepEqual(names, ["apple-developer-merchantid-domain-association"]);
  });

  it("is committed as binary, so no platform or git setting rewrites it", () => {
    const attrs = execFileSync("git", ["check-attr", "text", "binary", "--", REL], { cwd: rootDir, encoding: "utf8" });
    assert.match(attrs, /: text: unset/);
    assert.match(attrs, /: binary: set/);
    const blob = execFileSync("git", ["show", `HEAD:${REL}`], { cwd: rootDir });
    assert.equal(createHash("sha256").update(blob).digest("hex"), ASSOCIATION_SHA256, "the committed blob too");
  });

  it("is no longer at the repository root", () => {
    assert.equal(readdirSync(rootDir).includes("apple-developer-merchantid-domain-association"), false);
  });
});
