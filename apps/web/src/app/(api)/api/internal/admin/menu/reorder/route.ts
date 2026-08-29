// SPRINT-12: POST /api/internal/admin/menu/reorder — atomic sortOrder write.
import { reorderEntities } from "@harolds/db";
import { requireAdmin } from "@/lib/admin-auth";
import { adminAuthError, adminOk } from "@/lib/admin-http";
import { readAdminJson } from "@/lib/admin-body";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    const session = await requireAdmin(request);
    const parsed = await readAdminJson(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.value as { kind?: string; orderedIds?: string[] };
    const kind = body.kind as "categories" | "items" | "modifierGroups" | "modifierOptions";
    await reorderEntities(kind, body.orderedIds ?? [], session.userId);
    return adminOk({ ok: true });
  } catch (err) {
    return adminAuthError(err);
  }
}
