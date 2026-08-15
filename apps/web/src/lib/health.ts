// SPRINT-9: dependency-aware health — process alive is not enough; database and worker matter.
import { env, getWorkerStaleMs } from "@harolds/config";
import { prisma } from "@harolds/db";
import { getSquareEnvironment } from "@harolds/square";
import { getWorkerHeartbeat } from "@/lib/worker-heartbeat";

export type HealthSnapshot = {
  ok: boolean;
  squareEnvironment: string;
  nodeEnv: string;
  contractVersion: "1.2.0";
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
    squareEnvironment: getSquareEnvironment(),
    nodeEnv: env.NODE_ENV,
    contractVersion: "1.2.0",
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
