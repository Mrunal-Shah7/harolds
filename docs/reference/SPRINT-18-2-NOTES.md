<!-- SPRINT-18.2: NMI production host and configuration integrity. Agent phases 0–7. Phase 8 (cutover) is the operator's and has not happened. -->

# Sprint 18.2: NMI production host and configuration integrity

**Status: code complete and verified locally. Nothing is deployed, and no NMI or Merchant Pay
Connect host was contacted.**

The code now addresses the Merchant Pay Connect gateway in production. That host is stated in
exactly one module. The two `NEXT_PUBLIC_NMI_*` variables are gone, so the browser can no longer
disagree with the server about which gateway is live.

---

## 0. Prerequisites, baseline, render boundary

**Merchant Pay Connect URLs (operator-confirmed, Sprint 18.2):**

| Surface | URL |
|---|---|
| Payment API | `https://mpc.transactiongateway.com/api/transact.php` |
| Query API | `https://mpc.transactiongateway.com/api/query.php` |
| Collect.js | `https://mpc.transactiongateway.com/token/Collect.js` |
| CSP origin | `https://mpc.transactiongateway.com` |
| Test environment | **None** |

**These match the URLs Sprint 18.1 inferred exactly; there is no divergence from NMI's standard path
layout.** The operator also supplied the Collect.js bundle served from that URL. It shows that the
inline card-field iframes load from the script's own origin (`inlineUrl` is derived from
`scriptUrl`). `collectcheckout.com` is used only for the Google Pay and Apple Pay iframes, which
this checkout does not use. So the MPC origin is the only gateway origin the CSP needs, plus the
existing Apple SDK host.

**Sprint 17's uncommitted diff: not present.** The brief expected 31 uncommitted files. The tree
was clean at `1373d4b`, Sprint 17 was already committed (`e9e4b60`), and the only untracked file
was the 18.1 audit. The prerequisite is met, but not in the way described. As a result, the lint
errors the brief expected to disappear are still there (§7).

**Baseline** (tree at `1373d4b`, all test runs with a preloaded guard that blocks `fetch` to any
`nmi.com`, `transactiongateway.com` or `networkmerchants.com` host):

- Tests: 447 in total (config 31, email 4, payments 19, print 25, pricing 65, db 145, notify 17,
  web 141). The first run had one failure, `kitchen-alerts.test.ts`, which is flaky (§7). The
  second run passed 447/447.
- Typecheck is clean.
- Lint: 5 errors and 10 warnings, none of them payment-related.
- Build: `/checkout` was `○` static, 10.3 kB / 129 kB first load. Middleware 49.3 kB.

**Audit references re-verified.** Every file:line that 18.1 cited was still at the same place. One
consumer the audit did not list: `apps/web/src/lib/startup.ts:10, 41` also read the public
identifiers, through `publicPaymentIdsPresentAtBuild`.

**Render boundary at `/checkout`, as traced:**

1. `app/layout.tsx` is the root layout (server).
2. `app/(storefront)/layout.tsx` is a server component that renders the client `CartProvider`.
3. **`app/(storefront)/checkout/layout.tsx` is a server component.** Sprint 18 added it only to
   export metadata, and it rendered `children` untouched.
4. `app/(storefront)/checkout/page.tsx` is `"use client"`.
5. `components/storefront/nmi-payment-form.tsx` is `"use client"`.

**A server boundary exists (step 3), directly above the page.** A layout cannot pass props to its
page, so the resolved values travel through a small client context provider that the layout
renders. That is the standard pattern for a server layout above a client page.

---

## 1. One source for the gateway host

`packages/config/src/nmi-gateway.ts` is the only module that states the gateway. It maps
`NMI_ENVIRONMENT` to an origin, and derives `transactUrl`, `queryUrl` and `collectJsUrl` from that
origin. The consumers:

| Consumer | How |
|---|---|
| Payment + Query API | `payments.ts` `getNmiConfig().gateway` → `client.ts` `postToGateway` |
| Collect.js | `payments.ts` `getNmiBrowserConfig()` → `checkout/layout.tsx` → context → form |
| CSP | `security.ts` `contentSecurityPolicy(environment)` → `nmiGatewayUrls(env).origin` |
| Health / startup | `activeNmiGateway()` / `getNmiBrowserConfig()` |
| `sprint9-live-checks.mjs` | reads `paymentGatewayOrigin` from health, so it holds no literal |

**The host belongs in code, not in an environment variable** (the audit offered both options; this
sprint chose code). An env var would let a mistyped value route real card traffic somewhere
unintended, with nothing in review to catch it. The host changes only when the reseller changes,
which is a code change and should be reviewed as one.

**Sandbox branch.** MPC offers no test environment, so the sandbox branch stays on the generic NMI
sandbox (`https://sandbox.nmi.com`). **The sandbox exercises the code path, not the real
integration.** The first MPC request happens at cutover (Phase 8).

The misleading comment at `payments.ts:10-13` ("secure.nmi.com … verified against the gateway") is
replaced with a pointer to `nmi-gateway.ts`, and the base-URL constants are removed.

**Proof of a single source:** a repository search for `transactiongateway.com`,
`secure.nmi.com`, `sandbox.nmi.com` and `networkmerchants.com` across all tracked and new files,
excluding `*.md`, `docs/` and tests, finds only `packages/config/src/nmi-gateway.ts` (lines 25-26,
plus the line-16 comment that contrasts it with the generic host). Among tests, only
`nmi-gateway.test.ts` pins the literal URLs. That repetition is deliberate: a test that derived its
expected values from the module would prove nothing.

---

## 2. CSP derived from the same source

`contentSecurityPolicy(environment = env.NMI_ENVIRONMENT)` allows **only the active gateway's
origin**, in `script-src`, `style-src`, `frame-src` and `connect-src`. The Apple SDK host stays on
`script-src`, for the reason recorded in Sprint 17.

`security.test.ts` derives the expected origin for both branches and asserts the other branch's
origin is absent. `nmi-gateway.test.ts` asserts against the literals: the production policy
contains no `nmi.com` or `networkmerchants.com`, and the sandbox policy contains no
`transactiongateway.com`.

**Confirmed against the header generated at runtime:** one build, started twice (§4). The CSP is
built by the middleware, and the middleware reads `NMI_ENVIRONMENT` at runtime, not at build.
Before this sprint that was an assumption.

---

## 3. Collect.js and the public variables: Option A

**Option A was taken**, because the server boundary exists.

- `checkout/layout.tsx` calls `getNmiBrowserConfig()` on every request and renders
  `NmiCheckoutConfigProvider` (`components/storefront/nmi-checkout-config.tsx`).
- The form reads `useNmiCheckoutConfig()`. It renders `<Script>` only when both values are present;
  otherwise it reports "Payments are not configured yet", which is the existing behaviour.
- **`NEXT_PUBLIC_NMI_ENVIRONMENT` and `NEXT_PUBLIC_NMI_TOKENIZATION_KEY` are deleted.** They are
  gone from `env.ts`, `production-guards.ts`, `next.config.ts` (the build-time assertion), the
  form, `startup.ts` and `.env.example`. `payments-public.ts` and its test are deleted, along with
  the `@harolds/config/payments-public` export.
- A search of `apps`, `packages` and `scripts` finds no reader, only two comments saying the
  variables no longer exist. `env.test.ts` asserts that stray values are ignored.
- **Finding F6 is closed by giving the variable a job**: the active `NMI_TOKENIZATION_KEY_*` is now
  the key Collect.js receives.

**The cost: `/checkout` is now dynamically rendered.** It was `○` (prerendered, revalidated hourly);
it is now `ƒ` (`export const dynamic = "force-dynamic"`). This is required for correctness, not a
convenience. A prerendered page would freeze the gateway into HTML at build time, bringing back the
stale-bundle failure in a new form. The page is a client component, so the per-request server work
is one server-side render of the checkout tree plus `generateMetadata`. There is no extra round trip
before the card fields render: the values are in the first response.

**Rendered `/checkout` source** (same build, sandbox start and then production start; tokenization
key masked):

```
sandbox:    ...{\"config\":{\"collectJsUrl\":\"https://sandbox.nmi.com/token/Collect.js\",\"tokenizationKey\":\"<tokenization-key>\"},...
production: ...{\"config\":{\"collectJsUrl\":\"https://mpc.transactiongateway.com/token/Collect.js\",\"tokenizationKey\":\"<tokenization-key>\"},...
```

`next/script` with `strategy="afterInteractive"` injects the `<script>` tag on the client after
hydration. So in the server HTML the URL appears in the React Server Components payload that
drives that injection, not as a literal `<script src>` tag. Neither response names any other
gateway. The built client chunks contain no gateway host and no `NEXT_PUBLIC_NMI` string.

---

## 4. Startup guards and health

With Option A, **a server-versus-bundle mismatch is impossible by construction.** The bundle holds
no gateway configuration; the page, the CSP and health all resolve from the server's
`NMI_ENVIRONMENT` at request time.

- **Health** gains two additive fields: `paymentGatewayOrigin` and `collectJsUrl`. Observed from one
  build started twice:

  | Start | `paymentEnvironment` | `paymentGatewayOrigin` | `collectJsUrl` |
  |---|---|---|---|
  | sandbox | `sandbox` | `https://sandbox.nmi.com` | `https://sandbox.nmi.com/token/Collect.js` |
  | production | `production` | `https://mpc.transactiongateway.com` | `https://mpc.transactiongateway.com/token/Collect.js` |

  There is no "disagreeing" state to show, because nothing remains that could disagree. Restarting
  with a different `NMI_ENVIRONMENT` changes the page, the CSP and health together, with no
  rebuild. (Health returned 503 in these runs only because the worker was deliberately not
  started; see §9.)
- **`app.startup_summary`** now logs `collectJsUrl` and `collectJsKeyConfigured` in place of
  `paymentClientIdsAtBuild`.
- **Guards:**
  - An unrecognised `NMI_ENVIRONMENT` (for example `Production`, `live`, or ` production`) still
    refuses to start (tested).
  - Production refuses to start without the active tokenization key (tested).
  - A guard failure message names variables and never values; tested with a sentinel value.
  - A correct production configuration with only the live triple set starts (tested). Both
    environments start and serve (§3).

---

## 5. Webhook hardening

1. **Raw bytes.** The route reads `Buffer.from(await request.arrayBuffer())` and caps it by
   `byteLength`. `verifyWebhookSignature` takes `body: Buffer` only (the type no longer accepts a
   string) and HMACs `<nonce>.` followed by the bytes. The handler verifies first, then decodes
   with `TextDecoder` (which drops a BOM, as `request.text()` did) and parses.
2. **Timestamp tolerance: not implemented. This is a deviation, and deliberate.** The `t=` value is
   **not a timestamp**. NMI's own verification example names it `$nonce`
   ([NMI docs](https://docs.nmi.com/reference/overview)), and third-party integrations describe it
   as a random value per delivery
   ([Hookdeck](https://hookdeck.com/webhooks/skills/nmi-webhooks)). Sprint 17 labelled it
   "timestamp" without evidence. There is no clock to compare against, so any window would reject
   every real delivery at cutover. Replays remain absorbed by `event_id` dedupe (tested). The code
   now calls the value `nonce` everywhere, so the next reader is not tempted to add a window.
3. **Diagnosable failures without secrets.** `webhook.signature_verification` now logs `reason`
   (`missing_header` / `malformed_header` / `digest_length_mismatch` / `digest_mismatch` /
   `verified`), `gatewayEnvironment`, `bodyBytes`, `headerSegments`, `nonceChars`, `digestChars` and
   `digestIsHex`. It never logs the header, nonce, digest, key or body; this is asserted in a test.

Tests:

- `packages/payments/src/client.test.ts`: a valid signature verifies. A BOM-prefixed body with an
  invalid UTF-8 byte verifies over the bytes, and fails when HMAC'd as decoded text, which is the
  old defect. A modified body, a wrong key and a malformed header are all rejected. An
  old-looking nonce is not rejected on age. The log-content check passes.
- `apps/web/src/lib/webhooks-nmi.test.ts`, run through the real route against the real database:
  - a BOM-prefixed delivery verifies (200);
  - a replayed event id returns `DUPLICATE`, with one row stored;
  - a modified body returns 401 and stores nothing (parsing happens only after verification);
  - an unparseable body returns 401 if unsigned and 400 only once it verifies;
  - a missing header returns 401 and logs the reason, not the body.

---

## 6. Documentation and scripts

- **Generic host corrected:** `.env.example`, `SECURITY.md` §3 and §4 (plus the rotation and
  incident rows now name the MPC portal), and `STOREFRONT-REQUIREMENTS.md` (the build-time bullet
  and §8). Each now states that the host comes from the reseller and is set once, in
  `nmi-gateway.ts`.
- **The `DEPLOYMENT.md:148` contradiction** is resolved in favour of what the code does: both
  triples **may** coexist in production, and only the triple matching `NMI_ENVIRONMENT` is read.
  The §7 glance check now requires the MPC origin in health.
- **`pnpm reconcile`** now runs with `tsx --env-file=../../.env`, the same as `reconcile:sprint16`
  (F11). Not executed, because it would call the Query API.
- **`LAUNCH-BLOCKERS.md`** row 4 is corrected: the `_LIVE` triple is not placeholders. It also
  records that `reconcile:sprint16` is database-only; the earlier mapping that listed it as a Query
  API consumer was wrong.
- **OpenAPI:** the two health fields are recorded as additive. The webhook is described as
  `<nonce>.<body>` over raw bytes.

---

## 7. Suite and handover

The suite was run twice, identically: typecheck, lint, build, then tests, with the fetch guard
preloaded.

| | Run 1 | Run 2 |
|---|---|---|
| Typecheck | clean | clean |
| Lint | 5 errors, 9 warnings | identical |
| Build | pass, route table identical | pass, route table identical |
| Tests | 471; 470 pass, 1 fail | 471; 470 pass, 1 fail |
| Gateway guard fired | 0 | 0 |

- **Lint** is the baseline minus one warning (the deleted `payments-public.ts`'s `process.env`
  read). The **5 errors are pre-existing and unrelated**: unused imports in
  `packages/db/src/order-status.ts` and `order-status.test.ts`, and in
  `packages/notify/src/handlers.ts` and `templates.test.ts`. They were not fixed here because they
  are outside this sprint's scope.
- **The single test failure is the pre-existing flaky `packages/db/src/kitchen-alerts.test.ts`**, and
  a different case failed in each run. `enqueueUnacknowledgedKitchenAlerts` sweeps every qualifying
  paid order in the database, and the test asserts exact counts while other `packages/db` files
  create paid orders concurrently. It also failed at baseline, and it failed in one of two further
  runs with one workspace at a time (471/471, then 470/471). This sprint touches nothing in
  `packages/db`.
- **Test count** went from 447 to 471: config 31→40, payments 19→28, web 141→147.

**Bundle deltas:**

| Route | Before | After | Why |
|---|---|---|---|
| `/checkout` | `○` 10.3 kB / 129 kB | `ƒ` 10.4 kB / 129 kB | +0.1 kB for the context provider and hook, minus the two inlined constants; now dynamic (§3) |
| API route stubs | 312 B | 310 B | `payments-public` removed from the config bundle |
| Middleware | 49.3 kB | 49.3 kB | the CSP now looks the origin up instead of joining a list |
| Everything else | unchanged | unchanged | |

**API contract:** no path, request or error change. `openapi-drift` passes. One **additive** change:
`GET /api/v1/health` gains `data.paymentGatewayOrigin` and `data.collectJsUrl`. Phase 4 requires
health to report the Collect.js host, so a strict "no contract change" is not achievable. The
version stays `1.3.0` as additive, following the Sprint 9 precedent. `openapi:validate` still fails
on its pre-existing `info.version` expectation (`1.2.0` vs `1.3.0`, Sprint 17 open item 10).

---

## 8. Deviations

1. **No webhook timestamp tolerance.** The value is a nonce (§5).
2. **Health gained two additive fields**, which is a contract change, though additive (§7).
3. **Option A goes through a context provider, not props**, and makes `/checkout` dynamic. Both are
   required for correctness (§3).
4. **The 5 lint errors remain.** Their premise, that they would leave with Sprint 17's uncommitted
   diff, did not hold, because there was no such diff (§0).
5. **The suite is not identical across runs** because of the pre-existing flaky kitchen-alerts
   test. Everything else is identical (§7).
6. **Header comments:** `package.json` and `packages/config/package.json` cannot hold comments. The
   18.1 audit report is carried over unchanged. Every other touched file has a `SPRINT-18.2`
   header.
7. **The literals are also in `nmi-gateway.test.ts`.** This is the deliberate pin; without it the
   "both branches" gate cannot be proven.
8. **The local `.env` still contains the two retired `NEXT_PUBLIC_NMI_*` lines** and the `_LIVE`
   triple. The operator's file was not edited, and nothing reads the retired lines.
9. I ran `git add -N .` (intent-to-add) so the final search could see new files. It stages no
   content.

---

## 9. Processes started, and how they ended

| Started | Ended |
|---|---|
| `pnpm test` / `typecheck` / `lint` / `build` (baseline, verification, two suite runs, two serial test runs) | Foreground; exited |
| `openapi:validate`, `openapi-drift` | Foreground; exited |
| `next start` ×3 on ports 3101-3103 (one sandbox, two production), from one build, via a temp probe script | Killed with `taskkill /T /F` by the probe; the ports were confirmed closed and only Cursor's own Node processes remain |
| `sprint9-live-checks.mjs` against the production start | Exited 0 on the second attempt. The first attempt failed because the probe had blocked on a synchronous child process while holding the server's stdout pipe; the server's output was moved to a file |
| One web search (for NMI's `t=` semantics) | A search engine, not an NMI or MPC host |

For every server start:

- `NEXT_PHASE` was set, so instrumentation did not run: no job worker, no reconcile scheduler, no
  email, no print sweeper.
- All six NMI credentials were replaced with dummy values.
- A fetch guard blocking every gateway host was preloaded; it never fired.

The printer-poll loop sent no serial, so it changed nothing in the database. Temporary files are in
`%TEMP%\s182`, outside the repository.
