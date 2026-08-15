// SPRINT-8: GET/POST /api/internal/admin/modifiers
import { createModifierGroup, listAdminModifierGroups } from "@harolds/db";
import { requireAdmin } from "@/lib/admin-auth";
import { adminAuthError, adminOk } from "@/lib/admin-http";
import { readAdminJson } from "@/lib/admin-body";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    return adminOk(await listAdminModifierGroups());
  } catch (err) {
    return adminAuthError(err);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdmin(request);
    const parsed = await readAdminJson(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.value as {
      name?: string;
      prompt?: string;
      isRequired?: boolean;
      minSelect?: number;
      maxSelect?: number;
      sortOrder?: number;
    };
    return adminOk(
      await createModifierGroup(
        {
          name: body.name ?? "",
          prompt: body.prompt ?? "",
          isRequired: body.isRequired,
          minSelect: body.minSelect ?? 0,
          maxSelect: body.maxSelect ?? 1,
          sortOrder: body.sortOrder,
        },
        session.userId,
      ),
      { status: 201 },
    );
  } catch (err) {
    return adminAuthError(err);
  }
}
