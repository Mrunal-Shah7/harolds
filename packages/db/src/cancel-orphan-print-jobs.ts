// SPRINT-6: cancel print jobs addressed to serials that will never poll (Sprint 4 placeholders).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import { getPrinterConfig } from "@harolds/config";
import { cancelOrphanPrintJobs } from "./print-jobs";

async function main(): Promise<void> {
  const serials = getPrinterConfig().serials;
  const result = await cancelOrphanPrintJobs(serials);
  console.log(
    `Orphan print-job cleanup: cancelled=${result.cancelled} skipped=${result.skipped} knownSerials=${serials.join(",")}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
