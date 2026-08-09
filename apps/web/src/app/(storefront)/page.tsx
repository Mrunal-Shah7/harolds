// SPRINT-1: storefront placeholder — serves at `/` (route group name is not in the URL).
// Demonstrates that workspace package imports resolve (@harolds/types, @harolds/config, @harolds/db).
import { env } from "@harolds/config";
import { prisma } from "@harolds/db";
import { FulfilmentType, OrderStatus } from "@harolds/types";

export default function StorefrontPage() {
  // References prove package resolution at typecheck + build without executing DB I/O.
  const _proof = [
    FulfilmentType.PICKUP,
    OrderStatus.AWAITING_PAYMENT,
    env.NODE_ENV,
    typeof prisma.$connect,
  ].join(":");

  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>Storefront</h1>
      <p>Harold&apos;s Chicken Oak Lawn — customer ordering surface (placeholder).</p>
      <p style={{ color: "#666", fontSize: "0.875rem" }}>Workspace proof: {_proof}</p>
    </main>
  );
}
