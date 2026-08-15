// SPRINT-3: POST /api/v1/quote — stateless cart pricing (no persistence, no side effects)
import { fetchItemsForQuote, getStoreConfig, getStoreStatus } from "@harolds/db";
import { parseCartRequest, quoteCart, toMenuCatalog } from "@harolds/pricing";
import { ApiErrorCode } from "@harolds/types";
import { fail, handleRouteError, ok } from "@/lib/api";
import { BODY_LIMITS, readBoundedJson } from "@/lib/read-json";
import { enforceRateLimit } from "@/lib/enforce-rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    const limited = enforceRateLimit(request, "quote");
    if (limited) return limited;

    const parsedBody = await readBoundedJson(request, { maxBytes: BODY_LIMITS.jsonPublicBytes });
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.value;

    const parsed = parseCartRequest(body);
    if (!parsed.ok) {
      return fail(ApiErrorCode.VALIDATION_ERROR, "Cart validation failed.", {
        reasons: parsed.reasons,
      });
    }

    const itemIds = parsed.cart.lines.map((l) => l.itemId);
    const [rows, config, status] = await Promise.all([
      fetchItemsForQuote(itemIds),
      getStoreConfig(),
      getStoreStatus(),
    ]);

    const catalog = toMenuCatalog(rows);
    const quoted = quoteCart({
      cart: parsed.cart,
      catalog,
      store: {
        taxRateBps: config.taxRateBps,
        taxAppliedPreDiscount: config.taxAppliedPreDiscount,
        tippingEnabled: config.tippingEnabled,
        tipPresetsBps: config.tipPresetsBps,
        isOpen: status.isOpen,
        acceptingOrders: status.acceptingOrders,
        prepMinutes: status.prepMinutes,
        now: new Date(),
      },
    });

    if (!quoted.ok) {
      return fail(ApiErrorCode.VALIDATION_ERROR, "Cart validation failed.", {
        reasons: quoted.reasons,
      });
    }

    return ok(quoted.result, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
