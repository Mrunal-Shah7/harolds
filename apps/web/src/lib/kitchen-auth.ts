// SPRINT-6: require a valid kitchen staff session on every kitchen endpoint.
import { resolveKitchenSession, type ResolvedKitchenSession } from "@harolds/db";
import { bearerToken } from "@/lib/kitchen-http";
import { bindRequestId } from "@/lib/request-context";

export async function requireKitchenSession(request: Request): Promise<ResolvedKitchenSession> {
  bindRequestId(request);
  return resolveKitchenSession(bearerToken(request));
}
