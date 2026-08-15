// SPRINT-8: POST /api/internal/admin/store/closures
import { createStoreClosure, listStoreClosures } from "@harolds/db";
import { requireAdmin } from "@/lib/admin-auth";
import { adminAuthError, adminOk } from "@/lib/admin-http";
import { readAdminJson } from "@/lib/admin-body";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    return adminOk(await listStoreClosures());
  } catch (err) {
    return adminAuthError(err);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdmin(request);
    const parsed = await readAdminJson(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.value as { date?: string; reason?: string | null };
    return adminOk(await createStoreClosure(body.date ?? "", body.reason ?? null, session.userId), { status: 201 });
  } catch (err) {
    return adminAuthError(err);
  }
}
