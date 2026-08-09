// SPRINT-1: Next.js config — standalone output for self-hosted Ubuntu deployment
import type { NextConfig } from "next";
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load monorepo-root .env into process.env before the app boots (Next has no envDir option in 15.5).
loadDotenv({ path: path.join(__dirname, "../../.env") });

const nextConfig: NextConfig = {
  // Production is a long-lived Node process behind a reverse proxy, not serverless.
  output: "standalone",
  transpilePackages: ["@harolds/config", "@harolds/db", "@harolds/types"],
  // Prisma ships native binaries — keep them external to the webpack graph.
  serverExternalPackages: ["@prisma/client", "prisma"],
};

export default nextConfig;
