// SPRINT-2 / SPRINT-3 / SPRINT-11: Harold's mock API — fixture-backed /api/v1; checkout fields match the real contract.
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ApiErrorCode } from "@harolds/types";
import { parseCartRequest, quoteCart } from "@harolds/pricing";
import {
  FORCE_ERROR_MESSAGES,
  failBody,
  okBody,
  parseForceError,
  statusFor,
} from "./envelope";
import {
  categoriesFixture,
  cloneStoreStatus,
  featuredFixture,
  findItemById,
  findItemBySlugs,
  menuFixture,
  mostOrderedFixture,
} from "./fixtures";
import { buildCatalogFromFixtures } from "./catalog";
import {
  mockFindByIdempotency,
  mockFindByToken,
  mockGenerateLookupToken,
  mockNextOrderNumber,
  mockStoreOrder,
  toPublicStatus,
} from "./orders-memory";

const PORT = Number(process.env.MOCK_API_PORT ?? 4001);

const app = new Hono();

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "X-Mock-Error", "If-None-Match"],
    exposeHeaders: ["ETag", "Cache-Control"],
  }),
);

type RequestLike = {
  req: {
    query: (k: string) => string | undefined;
    header: (k: string) => string | undefined;
  };
};

function forceErrorFromRequest(c: RequestLike) {
  return (
    parseForceError(c.req.query("forceError")) ??
    parseForceError(c.req.header("X-Mock-Error"))
  );
}

function errorStatus(code: ApiErrorCode): ContentfulStatusCode {
  return statusFor(code) as ContentfulStatusCode;
}

app.get("/api/v1/menu", (c) => {
  const code = forceErrorFromRequest(c);
  if (code) return c.json(failBody(code, FORCE_ERROR_MESSAGES[code]), errorStatus(code));
  return c.json(okBody(menuFixture));
});

app.get("/api/v1/menu/categories", (c) => {
  const code = forceErrorFromRequest(c);
  if (code) return c.json(failBody(code, FORCE_ERROR_MESSAGES[code]), errorStatus(code));
  return c.json(okBody(categoriesFixture));
});

app.get("/api/v1/menu/items/:id", (c) => {
  const code = forceErrorFromRequest(c);
  if (code) return c.json(failBody(code, FORCE_ERROR_MESSAGES[code]), errorStatus(code));
  const item = findItemById(c.req.param("id"));
  if (!item) {
    return c.json(
      failBody(ApiErrorCode.NOT_FOUND, "Item not found."),
      errorStatus(ApiErrorCode.NOT_FOUND),
    );
  }
  return c.json(okBody(item));
});

app.get("/api/v1/menu/categories/:categorySlug/items/:itemSlug", (c) => {
  const code = forceErrorFromRequest(c);
  if (code) return c.json(failBody(code, FORCE_ERROR_MESSAGES[code]), errorStatus(code));
  const item = findItemBySlugs(c.req.param("categorySlug"), c.req.param("itemSlug"));
  if (!item) {
    return c.json(
      failBody(ApiErrorCode.NOT_FOUND, "Item not found."),
      errorStatus(ApiErrorCode.NOT_FOUND),
    );
  }
  return c.json(okBody(item));
});

app.get("/api/v1/menu/featured", (c) => {
  const code = forceErrorFromRequest(c);
  if (code) return c.json(failBody(code, FORCE_ERROR_MESSAGES[code]), errorStatus(code));
  return c.json(okBody(featuredFixture));
});

app.get("/api/v1/menu/most-ordered", (c) => {
  const code = forceErrorFromRequest(c);
  if (code) return c.json(failBody(code, FORCE_ERROR_MESSAGES[code]), errorStatus(code));
  return c.json(okBody(mostOrderedFixture));
});

app.get("/api/v1/store/status", (c) => {
  const code = forceErrorFromRequest(c);
  if (code) return c.json(failBody(code, FORCE_ERROR_MESSAGES[code]), errorStatus(code));

  const status = cloneStoreStatus();
  const forceStore = c.req.query("forceStore");
  if (forceStore === "closed") {
    status.isOpen = false;
    if (!status.nextOpenAt) {
      status.nextOpenAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    }
  } else if (forceStore === "not-accepting") {
    status.acceptingOrders = false;
    status.notAcceptingMessage =
      status.notAcceptingMessage ?? "We are not accepting online orders right now.";
  }

  return c.json(okBody(status));
});

/**
 * POST /api/v1/quote — same pure engine as the real API; catalog from fixtures.
 * Triggers: ?forceError=…, ?forceStore=closed|not-accepting, ?forceSoldOut=item|option
 */
app.post("/api/v1/quote", async (c) => {
  const code = forceErrorFromRequest(c);
  if (code) return c.json(failBody(code, FORCE_ERROR_MESSAGES[code]), errorStatus(code));

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      failBody(ApiErrorCode.VALIDATION_ERROR, "Request body must be JSON.", {
        reasons: [
          {
            code: "MALFORMED_BODY",
            message: "Request body must be valid JSON.",
            lineIndex: null,
            itemId: null,
            groupId: null,
            optionId: null,
            isAvailability: false,
          },
        ],
      }),
      errorStatus(ApiErrorCode.VALIDATION_ERROR),
    );
  }

  const parsed = parseCartRequest(body);
  if (!parsed.ok) {
    return c.json(
      failBody(ApiErrorCode.VALIDATION_ERROR, "Cart validation failed.", {
        reasons: parsed.reasons,
      }),
      errorStatus(ApiErrorCode.VALIDATION_ERROR),
    );
  }

  const status = cloneStoreStatus();
  const forceStore = c.req.query("forceStore");
  if (forceStore === "closed") status.isOpen = false;
  if (forceStore === "not-accepting") {
    status.acceptingOrders = false;
    status.notAcceptingMessage =
      status.notAcceptingMessage ?? "We are not accepting online orders right now.";
  }

  const forceSoldOut = c.req.query("forceSoldOut");
  const soldOutItemIds = new Set<string>();
  const soldOutOptionIds = new Set<string>();
  if (forceSoldOut === "item" && parsed.cart.lines[0]) {
    soldOutItemIds.add(parsed.cart.lines[0].itemId);
  }
  if (forceSoldOut === "option") {
    const opt = menuFixture.categories
      .flatMap((cat) => cat.items)
      .flatMap((it) => it.modifierGroups)
      .flatMap((g) => g.options)
      .find((o) => o.priceDeltaCents === 0);
    if (opt) soldOutOptionIds.add(opt.id);
  }

  const catalog = buildCatalogFromFixtures(menuFixture, { soldOutItemIds, soldOutOptionIds });
  const quoted = quoteCart({
    cart: parsed.cart,
    catalog,
    store: {
      taxRateBps: status.taxRateBps,
      taxAppliedPreDiscount: status.taxAppliedPreDiscount,
      tippingEnabled: status.tippingEnabled,
      tipPresetsBps: status.tipPresetsBps,
      isOpen: status.isOpen,
      acceptingOrders: status.acceptingOrders,
      prepMinutes: status.prepMinutes,
      now: new Date(),
    },
  });

  if (!quoted.ok) {
    return c.json(
      failBody(ApiErrorCode.VALIDATION_ERROR, "Cart validation failed.", {
        reasons: quoted.reasons,
      }),
      errorStatus(ApiErrorCode.VALIDATION_ERROR),
    );
  }

  return c.json(okBody(quoted.result), 200, {
    "Cache-Control": "no-store",
  });
});

/**
 * POST /api/v1/orders — fabricate paid order via shared pricing engine (no Square, no DB).
 * Triggers: ?forcePayment=declined|transport
 *           ?forceSoldOut=item
 *           ?forceStore=closed|not-accepting
 */
app.post("/api/v1/orders", async (c) => {
  const code = forceErrorFromRequest(c);
  if (code) return c.json(failBody(code, FORCE_ERROR_MESSAGES[code]), errorStatus(code));

  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json(
      failBody(ApiErrorCode.VALIDATION_ERROR, "Request body must be JSON."),
      errorStatus(ApiErrorCode.VALIDATION_ERROR),
    );
  }

  for (const key of Object.keys(body)) {
    if (/(?:Cents|Price)$/.test(key) || ["total", "subtotal", "tax", "price"].includes(key)) {
      return c.json(
        failBody(ApiErrorCode.VALIDATION_ERROR, "Client-supplied prices are not allowed.", {
          reasons: [{ code: "PRICE_FIELD_FORBIDDEN", message: key }],
        }),
        errorStatus(ApiErrorCode.VALIDATION_ERROR),
      );
    }
  }

  const idempotencyKey =
    typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
  if (idempotencyKey.length < 8) {
    return c.json(
      failBody(ApiErrorCode.VALIDATION_ERROR, "idempotencyKey is required."),
      errorStatus(ApiErrorCode.VALIDATION_ERROR),
    );
  }

  const existing = mockFindByIdempotency(idempotencyKey);
  if (existing) {
    return c.json(okBody(existing), 200, { "Cache-Control": "no-store" });
  }

  // SPRINT-11: match the real checkout contract — customer + token required, smsConsent explicit.
  const paymentToken = typeof body.paymentToken === "string" ? body.paymentToken : "";
  if (!paymentToken) {
    return c.json(
      failBody(ApiErrorCode.VALIDATION_ERROR, "paymentToken is required.", { field: "paymentToken" }),
      errorStatus(ApiErrorCode.VALIDATION_ERROR),
    );
  }
  const customer = body.customer;
  if (!customer || typeof customer !== "object" || Array.isArray(customer)) {
    return c.json(
      failBody(ApiErrorCode.VALIDATION_ERROR, "customer is required.", { field: "customer" }),
      errorStatus(ApiErrorCode.VALIDATION_ERROR),
    );
  }
  const cust = customer as Record<string, unknown>;
  for (const field of ["firstName", "lastName", "phone", "email"] as const) {
    if (typeof cust[field] !== "string" || !(cust[field] as string).trim()) {
      return c.json(
        failBody(ApiErrorCode.VALIDATION_ERROR, `customer.${field} is required.`, {
          field: `customer.${field}`,
        }),
        errorStatus(ApiErrorCode.VALIDATION_ERROR),
      );
    }
  }
  if (typeof cust.smsConsent !== "boolean") {
    return c.json(
      failBody(ApiErrorCode.VALIDATION_ERROR, "customer.smsConsent must be an explicit boolean.", {
        field: "customer.smsConsent",
      }),
      errorStatus(ApiErrorCode.VALIDATION_ERROR),
    );
  }

  const cartParsed = parseCartRequest(body.cart);
  if (!cartParsed.ok) {
    return c.json(
      failBody(ApiErrorCode.VALIDATION_ERROR, "Cart validation failed.", {
        reasons: cartParsed.reasons,
      }),
      errorStatus(ApiErrorCode.VALIDATION_ERROR),
    );
  }

  const status = cloneStoreStatus();
  const forceStore = c.req.query("forceStore");
  if (forceStore === "closed") {
    return c.json(
      failBody(ApiErrorCode.STORE_CLOSED, "The store is currently closed."),
      errorStatus(ApiErrorCode.STORE_CLOSED),
    );
  }
  if (forceStore === "not-accepting") {
    return c.json(
      failBody(ApiErrorCode.STORE_NOT_ACCEPTING_ORDERS, "The store is not accepting orders."),
      errorStatus(ApiErrorCode.STORE_NOT_ACCEPTING_ORDERS),
    );
  }

  const forceSoldOut = c.req.query("forceSoldOut");
  const soldOutItemIds = new Set<string>();
  if (forceSoldOut === "item" && cartParsed.cart.lines[0]) {
    soldOutItemIds.add(cartParsed.cart.lines[0].itemId);
  }

  const forcePayment = c.req.query("forcePayment");
  if (forcePayment === "declined") {
    return c.json(
      failBody(ApiErrorCode.PAYMENT_DECLINED, "Card was declined."),
      errorStatus(ApiErrorCode.PAYMENT_DECLINED),
    );
  }
  if (forcePayment === "transport") {
    return c.json(
      failBody(
        ApiErrorCode.PAYMENT_FAILED,
        "We could not confirm payment. Do not retry immediately.",
      ),
      errorStatus(ApiErrorCode.PAYMENT_FAILED),
    );
  }

  const catalog = buildCatalogFromFixtures(menuFixture, { soldOutItemIds });
  const quoted = quoteCart({
    cart: cartParsed.cart,
    catalog,
    store: {
      taxRateBps: status.taxRateBps,
      taxAppliedPreDiscount: status.taxAppliedPreDiscount,
      tippingEnabled: status.tippingEnabled,
      tipPresetsBps: status.tipPresetsBps,
      isOpen: true,
      acceptingOrders: true,
      prepMinutes: status.prepMinutes,
      now: new Date(),
    },
  });

  if (!quoted.ok) {
    const soldOut = quoted.reasons.some((r) => r.code === "ITEM_SOLD_OUT");
    if (soldOut) {
      return c.json(
        failBody(ApiErrorCode.ITEM_UNAVAILABLE, "One or more items are unavailable.", {
          reasons: quoted.reasons,
        }),
        errorStatus(ApiErrorCode.ITEM_UNAVAILABLE),
      );
    }
    return c.json(
      failBody(ApiErrorCode.VALIDATION_ERROR, "Cart validation failed.", {
        reasons: quoted.reasons,
      }),
      errorStatus(ApiErrorCode.VALIDATION_ERROR),
    );
  }

  const lookupToken = mockGenerateLookupToken();
  const orderNumber = mockNextOrderNumber();
  const order = {
    id: `mock_${lookupToken.slice(0, 12)}`,
    orderNumber,
    status: "PAID",
    paymentStatus: "CAPTURED",
    lookupToken,
    subtotalCents: quoted.result.subtotalCents,
    taxCents: quoted.result.taxCents,
    tipCents: quoted.result.tip.tipCents,
    tipRateBps:
      quoted.result.tip.type === "preset" || quoted.result.tip.type === "rate"
        ? quoted.result.tip.rateBps
        : null,
    totalCents: quoted.result.totalCents,
    taxRateBps: quoted.result.taxRateBps,
    taxAppliedPreDiscount: quoted.result.taxAppliedPreDiscount,
    estimatedReadyAt: quoted.result.estimatedReadyAt,
    tip: quoted.result.tip,
    lines: quoted.result.lines.map((l) => ({
      itemName: l.snapshot.itemName,
      boardLabel: l.snapshot.boardLabel,
      quantity: l.snapshot.quantity,
      baseUnitPriceCents: l.snapshot.baseUnitPriceCents,
      modifierTotalCents: l.snapshot.modifierTotalCents,
      effectiveUnitPriceCents: l.snapshot.effectiveUnitPriceCents,
      lineTotalCents: l.snapshot.lineTotalCents,
      selectedModifiers: l.snapshot.selectedModifiers,
      customerNote: l.snapshot.customerNote,
    })),
  };

  mockStoreOrder(order, idempotencyKey);
  return c.json(okBody(order), 200, { "Cache-Control": "no-store" });
});

app.get("/api/v1/orders/status/:lookupToken", (c) => {
  const code = forceErrorFromRequest(c);
  if (code) return c.json(failBody(code, FORCE_ERROR_MESSAGES[code]), errorStatus(code));
  const order = mockFindByToken(c.req.param("lookupToken"));
  if (!order) {
    return c.json(
      failBody(ApiErrorCode.NOT_FOUND, "Order not found."),
      errorStatus(ApiErrorCode.NOT_FOUND),
    );
  }
  return c.json(okBody(toPublicStatus(order)), 200, { "Cache-Control": "no-store" });
});

app.get("/api/v1/health", (c) => {
  return c.json(okBody({ ok: true, squareEnvironment: "mock", nodeEnv: "development", contractVersion: "1.2.0" }));
});

app.notFound((c) => {
  const code = forceErrorFromRequest(c);
  if (code) return c.json(failBody(code, FORCE_ERROR_MESSAGES[code]), errorStatus(code));
  return c.json(
    failBody(ApiErrorCode.NOT_FOUND, "Endpoint not found."),
    errorStatus(ApiErrorCode.NOT_FOUND),
  );
});

app.onError((err, c) => {
  console.error("[mock-api] unexpected error", err);
  return c.json(
    failBody(ApiErrorCode.INTERNAL_ERROR, FORCE_ERROR_MESSAGES[ApiErrorCode.INTERNAL_ERROR]),
    errorStatus(ApiErrorCode.INTERNAL_ERROR),
  );
});

console.log(`Harold's mock API listening on http://localhost:${PORT}`);
console.log("Mock error triggers:");
console.log(
  "  ?forceError=NOT_FOUND|VALIDATION_ERROR|STORE_CLOSED|STORE_NOT_ACCEPTING_ORDERS|ITEM_UNAVAILABLE|INTERNAL_ERROR",
);
console.log("  Header X-Mock-Error: <same codes>");
console.log("  ?forceStore=closed | ?forceStore=not-accepting");
console.log("  POST /api/v1/quote ?forceSoldOut=item|option (Sprint 3)");

serve({ fetch: app.fetch, port: PORT });
