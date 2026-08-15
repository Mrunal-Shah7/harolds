// SPRINT-11: bounded JSON reader for every admin body-accepting route.
import { BODY_LIMITS, readBoundedJson, type JsonReadResult } from "@/lib/read-json";

export async function readAdminJson(request: Request): Promise<JsonReadResult> {
  return readBoundedJson(request, { maxBytes: BODY_LIMITS.jsonAdminBytes, kind: "admin" });
}

export { BODY_LIMITS };
