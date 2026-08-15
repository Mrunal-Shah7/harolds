// SPRINT-1 / SPRINT-11: idempotent seed CLI — menu and accounts are separately invocable.
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import { prisma } from "../client";
import { parseSeedArgs, runSeed } from "./run";

export {
  STORE_SEED,
  HOURS_SEED,
  PLACEHOLDER_MANAGER_ALERT_PHONE,
  PLACEHOLDER_MANAGER_ALERT_EMAIL,
  TEST_STAFF_PIN,
  TEST_MANAGER_PIN,
  TEST_OWNER_PIN,
  TEST_STAFF_PASSWORD,
  TEST_MANAGER_PASSWORD,
  TEST_OWNER_PASSWORD,
  describeSeedRefusal,
  parseSeedArgs,
  runSeed,
} from "./run";

async function main(): Promise<void> {
  const args = parseSeedArgs(process.argv.slice(2), process.env);
  const result = await runSeed(args);
  if (!result.ok) {
    console.error(result.message);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
