// SPRINT-2: Harold's mock API server — fixture-backed /api/v1 parity on port 4001 (no DB/.env)
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ApiErrorCode } from "@harolds/types";
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

const PORT = Number(process.env.MOCK_API_PORT ?? 4001);

const app = new Hono();

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "OPTIONS"],
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

serve({ fetch: app.fetch, port: PORT });
