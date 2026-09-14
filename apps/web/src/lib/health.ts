// SPRINT-9 / SPRINT-12: dependency-aware health — process alive is not enough; database and worker matter.
import { env, getWorkerStaleMs } from "@harolds/config";
import { prisma } from "@harolds/db";
import { getPaymentEnvironment } from "@harolds/payments";
import { API_CONTRACT_VERSION } from "@harolds/types";
import { getWorkerHeartbeat } from "@/lib/worker-heartbeat";

export type HealthSnapshot = {
  ok: boolean;
  paymentEnvironment: string;
  nodeEnv: string;
  contractVersion: typeof API_CONTRACT_VERSION;
  checks: {
    database: "up" | "down";
    worker: "up" | "stale" | "down";
  };
  worker: {
    lastPassAt: string | null;
    staleAfterMs: number;
  };
};

async function defaultDatabaseUp(): Promise<boolean> {
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("database health timeout")), 2000);
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function getHealthSnapshot(
  now = new Date(),
  deps: { databaseUp?: () => Promise<boolean> } = {},
): Promise<HealthSnapshot> {
  const staleAfterMs = getWorkerStaleMs();
  const dbUp = await (deps.databaseUp ?? defaultDatabaseUp)();
  const { lastPassAt, startedAt } = getWorkerHeartbeat();
  let worker: "up" | "stale" | "down" = "down";
  if (lastPassAt) {
    worker = now.getTime() - lastPassAt.getTime() <= staleAfterMs ? "up" : "stale";
  } else if (startedAt && now.getTime() - startedAt.getTime() < staleAfterMs) {
    worker = "up";
  }
  const ok = dbUp && worker === "up";
  return {
    ok,
    paymentEnvironment: getPaymentEnvironment(),
    nodeEnv: env.NODE_ENV,
    contractVersion: API_CONTRACT_VERSION,
    checks: {
      database: dbUp ? "up" : "down",
      worker,
    },
    worker: {
      lastPassAt: lastPassAt?.toISOString() ?? null,
      staleAfterMs,
    },
  };
}
