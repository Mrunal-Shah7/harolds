// SPRINT-2 / SPRINT-4: assert OpenAPI paths stay in sync with mock-api route table
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const openapiPath = path.join(rootDir, "docs/openapi/v1.yaml");
const mockServerPath = path.join(rootDir, "packages/mock-api/src/server.ts");

const REQUIRED = [
  "/api/v1/menu",
  "/api/v1/menu/categories",
  "/api/v1/menu/items/:id",
  "/api/v1/menu/categories/:categorySlug/items/:itemSlug",
  "/api/v1/menu/featured",
  "/api/v1/menu/most-ordered",
  "/api/v1/store/status",
  "/api/v1/quote",
  "/api/v1/orders",
  "/api/v1/orders/status/:lookupToken",
  "/api/v1/health",
] as const;

/** Present in OpenAPI for Square only — real app has it; mock does not (and must not) serve webhooks. */
const OPENAPI_ONLY = ["/api/v1/webhooks/square"] as const;

function openApiPathToHono(openApiPath: string): string {
  return openApiPath.replace(/\{([^}]+)\}/g, ":$1");
}

function main(): void {
  const yaml = readFileSync(openapiPath, "utf8");
  const mockSrc = readFileSync(mockServerPath, "utf8");

  const openApiPaths = [...yaml.matchAll(/^\s{2}(\/api\/v1\/[^\s:]+):/gm)].map((m) => m[1]!);
  const uniqueOpenApi = [...new Set(openApiPaths)];

  for (const required of REQUIRED) {
    const openApiForm = required.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
    if (!uniqueOpenApi.includes(openApiForm)) {
      throw new Error(`Drift: OpenAPI missing path ${openApiForm}`);
    }
    if (!mockSrc.includes(`"${required}"`) && !mockSrc.includes(`'${required}'`)) {
      throw new Error(`Drift: mock-api server.ts missing route ${required}`);
    }
  }

  for (const p of OPENAPI_ONLY) {
    if (!uniqueOpenApi.includes(p)) {
      throw new Error(`Drift: OpenAPI missing webhook path ${p}`);
    }
  }

  for (const p of uniqueOpenApi) {
    if ((OPENAPI_ONLY as readonly string[]).includes(p)) continue;
    const hono = openApiPathToHono(p);
    if (!REQUIRED.includes(hono as (typeof REQUIRED)[number])) {
      throw new Error(`Drift: OpenAPI has unexpected path ${p}`);
    }
  }

  console.log(
    `OK — drift check passed (${REQUIRED.length} mock-aligned paths + ${OPENAPI_ONLY.length} Square-only)`,
  );
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
