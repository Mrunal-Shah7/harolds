# SPRINT-13: wallet verification checklist — prepared without a production domain;
# Phase 8 executes this once HTTPS exists on a real registered domain.

# Wallet verification checklist (Phase 8)

Prepared in Sprint 13 Phase 1.5. Execute **before** the rest of Phase 8 smoke tests.
A rendered wallet button is not evidence — each method needs a completed, refunded charge on a real device.

## Shared prerequisites

- [ ] Production (or staging) origin is `https://` on the **registered** customer domain.
- [ ] Square Dashboard / API environment is **production** (not sandbox) for go-live verification.
- [ ] `NEXT_PUBLIC_SQUARE_APPLICATION_ID`, `NEXT_PUBLIC_SQUARE_LOCATION_ID`, and `NEXT_PUBLIC_SQUARE_ENVIRONMENT=production` were set **at build time**.
- [ ] Content-Security-Policy in production still permits Square CDN and PCI connect hosts (`packages/config/src/security.ts`): `*.squarecdn.com`, `*.squareup.com`, `web.squarecdn.com`, `pci-connect.squareup.com` on `script-src`, `frame-src`, and `connect-src`.
- [ ] Reverse proxy does not strip or rewrite `/.well-known/*` except as documented below.
- [ ] Proxy body limits and CSP are unchanged for ordinary API routes when adding the Apple association file.

## Apple Pay

| Requirement | Detail |
|---|---|
| Domain registration | Register the exact checkout hostname with Square Apple Pay (`POST /v2/apple-pay/domains` or Dashboard → Apple Pay → add domain). |
| Association file | Serve Square’s current file from `https://<domain>/.well-known/apple-developer-merchantid-domain-association` (no `.txt` suffix). Source of truth: `https://app.squareup.com/digital-wallets/apple-pay/apple-developer-merchantid-domain-association`. |
| Serving rules | HTTP GET → **200**, body is the association bytes, `Content-Type` preferably `application/octet-stream` or `text/plain`. No auth, no redirect chain that drops the path, no long-lived CDN cache of a stale file. |
| Proxy interaction | Terminate TLS at the proxy; map `location = /.well-known/apple-developer-merchantid-domain-association` to a static file **or** to the app. Do **not** exempt the entire `/.well-known/` tree from security headers if that would weaken other files; only this path needs to be reachable and unauthenticated. |
| CSP interaction | The association file is a plain GET of static bytes — CSP does not block it. Apple Pay UI runs inside Square’s Web Payments SDK frames/scripts already allowed by the existing Square CSP entries. Confirm production response headers still include that CSP after the proxy. |
| Device proof | Real **iPhone** (Safari) on cellular or non-store Wi‑Fi → tokenize → create order → **PAID** → refund → record payment + refund ids. |

## Google Pay

| Requirement | Detail |
|---|---|
| Domain / origin | HTTPS origin; Google Pay via Square Web Payments SDK uses the Square merchant / location already configured — confirm the production location ID matches the store. |
| Browser / device | Real **Android** Chrome (or supported browser) — not a desktop emulator. |
| CSP | Same Square `script-src` / `frame-src` / `connect-src` allowlist; Google Pay sheet is mediated by Square’s SDK. If a Google origin appears in network failures, add only what Square’s current Web Payments docs require and record it. |
| Device proof | Tokenize → order → **PAID** → refund → record ids. |

## Cash App Pay

| Requirement | Detail |
|---|---|
| Domain | HTTPS production origin; Cash App Pay enabled for the Square application / location. |
| Redirect | If the flow uses `redirectURL`, it must be an HTTPS URL on the registered domain that returns the customer to checkout/confirmation without losing the payment token handling Square’s SDK expects. |
| CSP | `connect-src` / `frame-src` must continue to allow Square hosts used by Cash App Pay. |
| Device proof | Real mobile device → complete charge → refund → record ids. |

## Phase 8 execution order

1. Deploy association file; confirm `curl -I https://<domain>/.well-known/apple-developer-merchantid-domain-association` → 200 from **outside** the server network.
2. Register Apple Pay domain with Square; wait until registration status is verified.
3. Confirm production CSP header contains Square hosts.
4. Apple Pay on iPhone → paid + refund.
5. Google Pay on Android → paid + refund.
6. Cash App Pay on a real device → paid + refund.
7. Itemise every charge and refund in `docs/SPRINT-13-NOTES.md`.

## Blocked outcome (allowed)

If a method cannot complete because a specific prerequisite is missing (domain not registered, association 404, A2P unrelated, etc.), record **blocked** with that unmet requirement — do not treat a visible button as a pass.
