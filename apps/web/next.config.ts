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
  // SPRINT-11: monorepo tracing root — standalone server.js lives under
  // .next/standalone/apps/web/server.js and must include workspace packages.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: [
    "@harolds/config",
    "@harolds/db",
    "@harolds/pricing",
    "@harolds/square",
    "@harolds/print",
    "@harolds/types",
    "@harolds/sms",
    "@harolds/email",
    "@harolds/notify",
  ],
  // Prisma + provider SDKs ship native / heavy deps — keep them external.
  serverExternalPackages: ["@prisma/client", "prisma", "square", "twilio", "resend"],
  webpack: (config, { nextRuntime }) => {
    if (nextRuntime === "edge") {
      const stub = path.join(__dirname, "src/empty-edge-stub.ts");
      config.resolve.alias = {
        ...(config.resolve.alias as Record<string, string>),
        [path.join(__dirname, "src/instrumentation.node.ts")]: stub,
        [path.join(__dirname, "src/lib/job-worker.ts")]: stub,
        [path.join(__dirname, "src/lib/reconcile-scheduler.ts")]: stub,
      };
    }
    return config;
  },
};

export default nextConfig;
