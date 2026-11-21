// Loads the monorepo-root .env for the seed CLI. A module of its own, imported FIRST by
// seed/index.ts: ES imports are evaluated before the importing module's body, so a
// loadDotenv() call in index.ts itself would run only after ./run had already imported
// @harolds/config, whose env schema validates process.env at load and would find it empty.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
loadDotenv({ path: path.join(rootDir, ".env") });
