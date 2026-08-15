// SPRINT-8: GET/POST /api/internal/admin/menu/items
import { createItem, listAdminItems, parseCurrencyInput } from "@harolds/db";
import { requireAdmin } from "@/lib/admin-auth";
import { adminAuthError, adminOk } from "@/lib/admin-http";
import { readAdminJson } from "@/lib/admin-body";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const active = url.searchParams.get("isActive");
    const sold = url.searchParams.get("isSoldOut");
    const unverified = url.searchParams.get("isUnverifiedPrice");
    const rows = await listAdminItems({
      categoryId: url.searchParams.get("categoryId") || undefined,
      isActive: active === null ? undefined : active === "true",
      isSoldOut: sold === null ? undefined : sold === "true",
      isUnverifiedPrice: unverified === null ? undefined : unverified === "true",
      q: url.searchParams.get("q") || undefined,
    });
    return adminOk(rows);
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
      categoryId?: string;
      price?: string;
      boardLabel?: string | null;
      description?: string | null;
      slug?: string;
      sortOrder?: number;
      imageUrl?: string | null;
    };
    const row = await createItem(
      {
        name: body.name ?? "",
        categoryId: body.categoryId ?? "",
        basePriceCents: parseCurrencyInput(body.price ?? ""),
        boardLabel: body.boardLabel,
        description: body.description,
        slug: body.slug,
        sortOrder: body.sortOrder,
        imageUrl: body.imageUrl,
      },
      session.userId,
    );
    return adminOk(row, { status: 201 });
  } catch (err) {
    return adminAuthError(err);
  }
}
