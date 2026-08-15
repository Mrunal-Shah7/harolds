// SPRINT-8: POST /api/internal/admin/modifiers/[id]/options
import { createModifierOption, parseCurrencyInput } from "@harolds/db";
import { requireAdmin } from "@/lib/admin-auth";
import { adminAuthError, adminOk } from "@/lib/admin-http";
import { readAdminJson } from "@/lib/admin-body";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdmin(request);
    const { id } = await ctx.params;
    const parsed = await readAdminJson(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.value as {
      name?: string;
      price?: string;
      priceDeltaCents?: number;
      sortOrder?: number;
      isDefaultSelected?: boolean;
    };
    const cents =
      typeof body.priceDeltaCents === "number"
        ? body.priceDeltaCents
        : parseCurrencyInput(body.price && body.price.trim() ? body.price : "0");
    return adminOk(
      await createModifierOption(
        id,
        {
          name: body.name ?? "",
          priceDeltaCents: cents,
          sortOrder: body.sortOrder,
          isDefaultSelected: body.isDefaultSelected,
        },
        session.userId,
      ),
      { status: 201 },
    );
  } catch (err) {
    return adminAuthError(err);
  }
}
