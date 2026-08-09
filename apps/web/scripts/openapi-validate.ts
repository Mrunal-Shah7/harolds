// SPRINT-2: validate docs/openapi/v1.yaml and assert documented paths match the published surface
import path from "node:path";
import { fileURLToPath } from "node:url";
import SwaggerParser from "@apidevtools/swagger-parser";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const specPath = path.join(rootDir, "docs/openapi/v1.yaml");

/** Canonical Sprint 2 public GET paths (real + mock). */
const EXPECTED_PATHS = [
  "/api/v1/menu",
  "/api/v1/menu/categories",
  "/api/v1/menu/items/{id}",
  "/api/v1/menu/categories/{categorySlug}/items/{itemSlug}",
  "/api/v1/menu/featured",
  "/api/v1/menu/most-ordered",
  "/api/v1/store/status",
] as const;

const EXPECTED_ERROR_CODES = [
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "STORE_CLOSED",
  "STORE_NOT_ACCEPTING_ORDERS",
  "ITEM_UNAVAILABLE",
  "INTERNAL_ERROR",
] as const;

async function main(): Promise<void> {
  console.log(`Validating OpenAPI: ${path.relative(rootDir, specPath)}`);
  const api = (await SwaggerParser.validate(specPath)) as {
    paths?: Record<string, unknown>;
    components?: { schemas?: { ApiErrorCode?: { enum?: string[] } } };
    info?: { version?: string };
  };

  const documented = Object.keys(api.paths ?? {}).sort();
  const expected = [...EXPECTED_PATHS].sort();

  const missing = expected.filter((p) => !documented.includes(p));
  const unexpected = documented.filter((p) => !expected.includes(p as (typeof EXPECTED_PATHS)[number]));

  if (missing.length > 0) {
    throw new Error(`OpenAPI drift: missing documented paths:\n- ${missing.join("\n- ")}`);
  }
  if (unexpected.length > 0) {
    throw new Error(
      `OpenAPI drift: unexpected paths (update EXPECTED_PATHS if intentional):\n- ${unexpected.join("\n- ")}`,
    );
  }

  for (const p of expected) {
    const methods = api.paths?.[p] as Record<string, unknown> | undefined;
    if (!methods || typeof methods.get !== "object") {
      throw new Error(`OpenAPI drift: path ${p} must define a GET operation`);
    }
  }

  const codes = api.components?.schemas?.ApiErrorCode?.enum ?? [];
  for (const code of EXPECTED_ERROR_CODES) {
    if (!codes.includes(code)) {
      throw new Error(`OpenAPI drift: ApiErrorCode enum missing ${code}`);
    }
  }

  if (api.info?.version !== "1.0.0") {
    throw new Error(`Expected info.version "1.0.0", got ${String(api.info?.version)}`);
  }

  console.log(`OK — ${documented.length} paths, ${codes.length} error codes, version ${api.info?.version}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
