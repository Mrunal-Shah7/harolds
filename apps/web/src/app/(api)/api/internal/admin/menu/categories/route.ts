// SPRINT-8: GET/POST /api/internal/admin/menu/categories
import { createCategory, listAdminCategories } from "@harolds/db";
import { requireAdmin } from "@/lib/admin-auth";
import { adminAuthError, adminOk } from "@/lib/admin-http";
import { readAdminJson } from "@/lib/admin-body";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    return adminOk(await listAdminCategories());
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
      slug?: string;
      description?: string | null;
      sortOrder?: number;
    };
    const row = await createCategory(
      {
        name: body.name ?? "",
        slug: body.slug,
        description: body.description,
        sortOrder: body.sortOrder,
        userId: session.userId,
      },
    );
    return adminOk(row, { status: 201 });
  } catch (err) {
    return adminAuthError(err);
  }
}
