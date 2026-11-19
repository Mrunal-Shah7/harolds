# Sprint 18.1 — NMI configuration audit (read-only)

Audit of commit `1373d4b` (working tree clean before this file). No source file was modified, no
NMI host was contacted, and no secret value appears below — environment variables are reported by
name only; local `.env` checks report booleans and the (non-secret) environment mode.

---

## 1. The answer

**Set `NMI_ENVIRONMENT="production"`** (lowercase, exact) — proof: `packages/config/src/env.ts:33`
(`z.enum(["sandbox", "production"])`) and `packages/config/src/payments.ts:61`
(`environment === "production"`). Set `NEXT_PUBLIC_NMI_ENVIRONMENT="production"` too, **before
`pnpm build`** (`apps/web/src/components/storefront/nmi-payment-form.tsx:58`).

**But do not set it yet:** today `"production"` routes every gateway call and the Collect.js
script to `secure.nmi.com`, not `mpc.transactiongateway.com` (§2). Setting the value correctly
with the current code produces a checkout that fails for every card.

---

## 2. Resolved hosts

`mpc.transactiongateway.com` occurs **nowhere** in the repository.

| # | Surface | Sandbox branch | Production branch | How resolved | Correct for MPC MID? |
|---|---|---|---|---|---|
| 1 | Payment API (sale, refund, void) | `https://sandbox.nmi.com/api/transact.php` | `https://secure.nmi.com/api/transact.php` | Constant base URL (`packages/config/src/payments.ts:15-16`), selected by `NMI_ENVIRONMENT` (`payments.ts:84`), path appended in `packages/payments/src/client.ts:81` | **Production: WRONG.** Sandbox: not MPC; works for the existing NMI sandbox account (Sprint 17 ran real sandbox transactions against it) |
| 2 | Query API | `https://sandbox.nmi.com/api/query.php` | `https://secure.nmi.com/api/query.php` | Same constants and same `postToGateway` (`client.ts:59-94`) | **Production: WRONG.** Sandbox: as above |
| 3 | Collect.js `<script src>` | `https://sandbox.nmi.com/token/Collect.js` | `https://secure.nmi.com/token/Collect.js` | Constant pair picked by build-time `NEXT_PUBLIC_NMI_ENVIRONMENT` (`nmi-payment-form.tsx:57-60`, rendered at `:196`) | **Production: WRONG.** Also blocked by CSP even once fixed — see F3 |
| 4 | Webhooks | No host | No host | Nothing in code registers a URL or checks the sender's host/IP. The URL `<NEXT_PUBLIC_APP_URL>/api/v1/webhooks/nmi` is registered by hand in the portal (`.env.example:51-52`, `docs/CUTOVER-PLAN.md:28`) | **Correct** (host-independent). Register it in the MPC portal, not an NMI one |

Expected MPC URLs, assuming the standard NMI path layout (confirm in the MPC portal's integration
docs, not tested): `https://mpc.transactiongateway.com/api/transact.php`, `.../api/query.php`,
`.../token/Collect.js`.

**Query API callers** (all go through `getPayment` / `getRefund` / `findPaymentByOrderId`,
`client.ts:224, 267, 368`): `pnpm reconcile` (`packages/db/src/reconcile-cli.ts:36`), the
scheduled pass (`apps/web/src/lib/reconcile-scheduler.ts:19`), the admin reconcile route
(`apps/web/src/app/(api)/api/internal/admin/reconcile/route.ts:23`), webhook convergence
(`apps/web/src/lib/webhooks-nmi.ts:134`), and charge recovery (`apps/web/src/lib/checkout.ts:620`).
**The Sprint 16 reconciliation script (`packages/db/src/sprint16-reconcile-cli.ts`) makes no
gateway call at all.** It is a database-only read. Its Query API usage is "not present in the
repository".

### Every generic-NMI hostname in the repository

| File:line | What | Severity |
|---|---|---|
| `packages/config/src/payments.ts:15-16` | Gateway base URL constants | **Production bug** |
| `apps/web/src/components/storefront/nmi-payment-form.tsx:59-60` | Collect.js src | **Production bug** |
| `packages/config/src/security.ts:86-88` | CSP gateway allowlist (`secure.nmi.com`, `sandbox.nmi.com`, `secure.networkmerchants.com`) | **Production bug** (MPC missing) |
| `packages/config/src/security.test.ts:34-40` | Test asserts the NMI hosts are in the CSP | Test, will need updating with F3 |
| `packages/config/src/payments.ts:11` | Comment | Documentation |
| `.env.example:23` | Operator doc: "sandbox.nmi.com vs secure.nmi.com" | **Documentation that will reintroduce the bug** |
| `docs/SECURITY.md:59, 88` | Names `secure.nmi.com` as the production host | Documentation |
| `docs/STOREFRONT-REQUIREMENTS.md:73` | CSP requirement lists the three NMI hosts | Documentation |
| `docs/SPRINT-17-NOTES.md:12, 135, 157-158, 387` | Historical | Historical, leave |
| `scripts/sprint9-live-checks.mjs:34` | `csp.includes("nmi.com")` | Check script; will report false once CSP is MPC-only |
| `packages/payments/src/test-cards.ts:5` | `support.nmi.com` docs link | Benign |

---

## 3. Fall-through of an unrecognised `NMI_ENVIRONMENT`

**Server side: no silent fall-through. An unrecognised value makes the process fail to start.**
`NMI_ENVIRONMENT` is validated by a zod enum (`env.ts:33`). The match is exact and
case-sensitive, and the value is not trimmed. `"Production"`, `"live"`, `"prod"` or
`"production "` inside quotes all fail. `parseEnv` throws (`env.ts:177-180`) when
`@harolds/config` is imported (`env.ts:201`). That stops the web server, the worker, every CLI, and
`next build` too: the `NEXT_PHASE` skip at `env.ts:196` only skips the production guards, not the
schema. Past the enum, `payments.ts:61` treats anything other than `"production"` as sandbox, but
only `"sandbox"` can reach it. The `.trim()` in `production-guards.ts:48` is never used, because zod
rejects the value first.

**Browser side: there IS a silent sandbox fall-through.** `nmi-payment-form.tsx:58` does
`process.env.NEXT_PUBLIC_NMI_ENVIRONMENT === "production"`. Any other value loads the **sandbox**
Collect.js. It is guarded in two places, and both guards have gaps:

- The build guard (`packages/config/src/payments-public.ts:27-29`) trims before comparing. So a
  quoted value with padding, such as `" production"`, passes the build and then fails the untrimmed
  `===`, landing in the sandbox branch.
- The production start guard (`production-guards.ts:68-70`) checks only that the variable is
  **present**. It checks neither the value nor that it matches `NMI_ENVIRONMENT`.
  `env.ts:53` declares it `z.string().optional()`.

The realistic failure is the one the brief warned about. Suppose the server runs with
`NMI_ENVIRONMENT=production`, but the bundle was built while the public variable was still
`sandbox` (built before the flip, or not rebuilt after it). Nothing refuses to start. Health reports
`production` (`apps/web/src/lib/health.ts:53` reads only the server variable). The browser loads
sandbox Collect.js, and every checkout fails in a way that looks like a bad key.

---

## 4. Environment variable inventory

All reads go through the config package (`env.ts:197`, the single `process.env` bootstrap). The two
`NEXT_PUBLIC_` values are also read literally in the client component, because Next.js inlines them
at build time.

| Variable | Read at | Used for | Required? |
|---|---|---|---|
| `NMI_ENVIRONMENT` | `env.ts:33`; `payments.ts:60`; `client.ts:51`; `production-guards.ts:45-58` | Selects the key triple and the gateway host. Reported by health (`health.ts:53`), the startup log (`startup.ts:47`) and the orders route (`orders/route.ts:15`) | **Always** (zod) |
| `NMI_SECURITY_KEY_SANDBOX` / `_LIVE` | `env.ts:44, 47`; `payments.ts:63` | `security_key` on every API POST (`client.ts:79`) | Optional in the schema. Required for the active environment at the first gateway call (`payments.ts:71`) and at production start (`production-guards.ts:55-58`) |
| `NMI_TOKENIZATION_KEY_SANDBOX` / `_LIVE` | `env.ts:45, 48`; `payments.ts:64-66` | **Nothing.** Returned in `NmiConfig.tokenizationKey`, which no code consumes | Required the same way as the security key, but unused (F6) |
| `NMI_WEBHOOK_SIGNING_KEY_SANDBOX` / `_LIVE` | `env.ts:46, 49`; `payments.ts:67-69` | Webhook HMAC (`client.ts:418`) | As for the security key |
| `NEXT_PUBLIC_NMI_TOKENIZATION_KEY` | `env.ts:52`; `payments-public.ts:21`; `production-guards.ts:63`; `nmi-payment-form.tsx:116, 196` | Collect.js `data-tokenization-key` | Required at build (`next.config.ts:15`) and at production start (presence only) |
| `NEXT_PUBLIC_NMI_ENVIRONMENT` | `env.ts:53`; `payments-public.ts:24-29`; `production-guards.ts:68`; `nmi-payment-form.tsx:58` | Chooses the Collect.js host | Required at build (value checked) and at production start (presence only) |

The gateway host is a **constant**, not a variable (`payments.ts:15-16`, `nmi-payment-form.tsx:59-60`).
No host override variable exists.

**Is the `NEXT_PUBLIC_` prefix necessary?** For the tokenization key, yes, given the design: a client
component reads it, and it is public by NMI's design. For `NEXT_PUBLIC_NMI_ENVIRONMENT`, no. It
exists only so the client component can pick the script host. A server component could pass the
resolved Collect.js URL down from server config, which would remove the duplicate variable and the
mismatch in §3. `NMI_ENVIRONMENT` itself is correctly **not** public.

**Cross-check against `.env.example` and docs.** All nine variables above are documented in
`.env.example:26-49` and `docs/SECURITY.md:76-78`. There are **no undocumented reads and no
documented-but-unread variables.** `.env.example` and the docs contradict each other on one point:
`docs/DEPLOYMENT.md:148` says "No sandbox NMI keys" in production, while `.env.example:28` and
`docs/SECURITY.md:109` say both triples live side by side and the inactive one may be blank.

### Secrecy boundary: PASS

- **Security key**: read only in `env.ts` / `payments.ts` and sent only from `client.ts:79`, all
  server-side. No `NEXT_PUBLIC_NMI_SECURITY*` or `NEXT_PUBLIC_NMI_WEBHOOK*` name exists anywhere in
  the repository.
- **Browser exposure**: none of the 29 `"use client"` files in `apps/web/src` imports
  `@harolds/config` or `@harolds/payments`. The only `process.env` reads in client files are
  `NEXT_PUBLIC_NMI_ENVIRONMENT` (not a credential) and `NEXT_PUBLIC_NMI_TOKENIZATION_KEY`, the only
  NMI credential that reaches the browser.
- **Webhook signing key**: used only in `client.ts:404-419`, server-side (the route is
  `runtime = "nodejs"`, `route.ts:9`).
- **Log redaction** covers both secret keys (`packages/config/src/log.ts:41-47, 56`).
- Hardening only, not a violation: there is no `server-only` import guard on `@harolds/config`.
  Next.js would not inline non-public variables into a client bundle anyway.

### Hardcoded credentials: none

The working tree and all 17 commits of history were scanned for: NMI's public demo security key,
the tokenization-key shape (`xxxxxx-xxxxxx-xxxxxx-xxxxxx`), `security_key=` literals, literal
`data-tokenization-key` values, non-empty `NMI_*_KEY` assignments, and 32-character alphanumeric
tokens. The only hits were false positives: a CSS selector
(`apps/web/src/app/globals.css:2197`, `harolds-design-v1_1.html:2323`) and a tsconfig option name
(`packages/config/tsconfig.base.json:16`). Sprint 17's deleted probe files (`__probe.ts`,
`__check.ts`) contain no keys. Test fixtures use self-evidently fake strings (`env.test.ts:19-21`,
`log.test.ts:14-15`, `payments-public.test.ts:20`). `.env` and `packages/db/.env` are gitignored
(`.gitignore:15`) and were never committed.

### Local `.env` (this machine; not in the repository)

- Mode is `sandbox`, and the server and public modes match.
- `NEXT_PUBLIC_NMI_TOKENIZATION_KEY` equals the active tokenization key.
- All six triple entries are set and parse identically under `dotenv` 16.6.1 and Node's
  `--env-file`, even though they are indented (lines 13-18).
- No `KEY= "value"` spacing trap and no stray whitespace.
- **The `_LIVE` triple is populated with values of valid NMI shape, distinct from the sandbox
  values.** `docs/LAUNCH-BLOCKERS.md:51` still calls them placeholders. See F9.

---

## 5. Findings, ordered by what breaks production soonest

**F1: Payment and Query API production host is `secure.nmi.com`. Blocker.**
`packages/config/src/payments.ts:16`.
Every sale, refund, void and query fails at cutover. Checkout, recovery, webhook convergence and
reconciliation all use this one base URL. NMI answers with HTTP 200 and an authentication
response, so it presents as a bad security key.
*Fix:* set the production base to `https://mpc.transactiongateway.com/api`, or make the host a
validated config value (for example an `NMI_GATEWAY_HOST` read through `env.ts`, with no default in
production). Update the comment at `payments.ts:10-13`.

**F2: Collect.js production src is `secure.nmi.com`. Blocker.**
`apps/web/src/components/storefront/nmi-payment-form.tsx:59`.
The card fields load from the wrong gateway, so the MPC tokenization key cannot tokenize.
*Fix:* use the MPC host. Ideally resolve it on the server from the same source as F1 and pass it as
a prop, so the two can never disagree.

**F3: The CSP does not allow `mpc.transactiongateway.com`. Blocker once F2 is fixed.**
`packages/config/src/security.ts:85-89` (used in `script-src`, `style-src`, `frame-src` and
`connect-src` at `:103-108`).
The browser would block the MPC script and its iframes.
*Fix:* add `https://mpc.transactiongateway.com` to the gateway list, and drop the generic NMI hosts
once nothing uses them. Update `security.test.ts:34-40`, `docs/STOREFRONT-REQUIREMENTS.md:73` and
`scripts/sprint9-live-checks.mjs:34`.

**F4: Nothing checks the server mode against the bundle mode, or the server key against the public
key.**
`production-guards.ts:63-70` (presence only), `env.ts:53` (`z.string()`), `nmi-payment-form.tsx:58`
(untrimmed `===`).
This is the silent-sandbox path in §3.
*Fix:* make `NEXT_PUBLIC_NMI_ENVIRONMENT` an enum in `env.ts`. In `production-guards.ts`, require
it to equal `NMI_ENVIRONMENT`, and require `NEXT_PUBLIC_NMI_TOKENIZATION_KEY` to equal
`NMI_TOKENIZATION_KEY_<active>`. Trim before comparing in the form, or remove the public variable as
described in §4. This does not detect a stale bundle (see F5).

**F5: The health glance check cannot see the bundle's environment.**
`apps/web/src/lib/health.ts:53`, `apps/web/src/lib/startup.ts:47`; the check is described in
`docs/DEPLOYMENT.md:150`.
Health says `production` even when checkout is running sandbox Collect.js.
*Fix:* report the build-time public mode (or the inlined Collect.js host) alongside it, and flag a
mismatch.

**F6: `NMI_TOKENIZATION_KEY_*` is required but never used.**
`packages/config/src/payments.ts:64-71`.
Startup fails if it is blank, yet the browser uses a separately maintained copy. Keeping the two
equal depends on a comment (`.env.example:47`, `payments-public.ts:45`).
*Fix:* either derive the public copy from it (the server passes it to the form) or drop it from the
required triple. This pairs with F4.

**F7: Webhook signature hardening.**
The core check passes (§7). The residual gaps are all low severity:
- `apps/web/src/app/(api)/api/v1/webhooks/nmi/route.ts:18` uses `request.text()`, which decodes the
  bytes as UTF-8. It is byte-exact for well-formed UTF-8 JSON, but it would strip a BOM or replace
  invalid sequences.
- `packages/payments/src/client.ts:413` parses the timestamp and never checks it against the clock,
  so there is no replay window. Replays are absorbed by `event_id` dedupe
  (`webhooks-nmi.ts:69-72`).
- The HMAC scheme has never been verified against a real delivery (`docs/SPRINT-17-NOTES.md:404-406`).

*Fix:* read `Buffer.from(await request.arrayBuffer())` and HMAC the buffer. `client.ts:405` would
need to stop converting it to a string. Add a timestamp tolerance, and verify one real MPC delivery
before relying on portal-issued refunds.

**F8: Documentation names the wrong production host.**
`.env.example:23`, `docs/SECURITY.md:59, 88`, `docs/STOREFRONT-REQUIREMENTS.md:73`, and the
`payments.ts:11` comment. `docs/DEPLOYMENT.md:148` also contradicts the side-by-side-triple design.
This is how F1 gets reintroduced.
*Fix:* rewrite them to name `mpc.transactiongateway.com` and to state that the host comes from the
reseller, not from NMI.

**F9: The local development `.env` holds a correctly shaped `_LIVE` triple.**
Local `.env` lines 14, 16 and 18.
If these are real MPC production keys, a development machine that runs tests against the sandbox
now holds a live security key. That conflicts with `docs/SECURITY.md:109`. `LAUNCH-BLOCKERS.md:51`
and `SPRINT-17-NOTES.md:414` are stale either way.
*Fix:* the operator confirms where the keys came from. If they are real, move them to the production
server only and consider rotating them.

**F10: The sandbox host `sandbox.nmi.com` is not an MPC host.**
`payments.ts:15`, `nmi-payment-form.tsx:60`, `security.ts:87`.
It works for the existing NMI sandbox account, so it is not a production bug.
*Fix:* confirm with Merchant Pay Connect whether it provides its own test environment. If it does,
point the sandbox branch there too.

**F11: Possible environment-loading hazard in `pnpm reconcile` (not verified by running).**
`packages/db/src/reconcile-cli.ts:3-11`, `package.json:35`.
The script calls `loadDotenv` after static ESM imports that are hoisted above it, and it has no
`--env-file`. That is the same hazard `docs/SPRINT-8-NOTES.md:98` documents.
Not run, because running it would call the Query API.
*Fix:* add `--env-file=../../.env` as `reconcile:sprint16` does.

**F12: Square remnants in operator docs.** See §7.

---

## 6. Pre-cutover checklist

Make the code changes in one deploy, in this order:

1. `packages/config/src/payments.ts`: production base URL to MPC; comment at lines 10-13 (F1).
2. `packages/config/src/security.ts`, then `packages/config/src/security.test.ts`: add MPC to the
   CSP (F3).
3. `apps/web/src/components/storefront/nmi-payment-form.tsx`: Collect.js src to MPC, ideally
   resolved from step 1 on the server (F2).
4. `packages/config/src/env.ts`, `packages/config/src/production-guards.ts` and
   `packages/config/src/payments-public.ts` (plus their tests): enum and consistency checks
   (F4, F6).
5. `apps/web/src/lib/health.ts`: expose the bundle environment (F5).
6. `.env.example`, `docs/SECURITY.md`, `docs/STOREFRONT-REQUIREMENTS.md`, `docs/DEPLOYMENT.md` (F8).
7. `scripts/sprint9-live-checks.mjs:34` (F3).
8. `package.json` `reconcile` script (F11). Optional, but do it before the first live
   reconciliation.

Then the operator, on the production server:

9. Production `.env`: fill the `_LIVE` triple from the MPC portal, set
   `NEXT_PUBLIC_NMI_TOKENIZATION_KEY` to the live tokenization key, and set
   `NMI_ENVIRONMENT="production"` and `NEXT_PUBLIC_NMI_ENVIRONMENT="production"`.
10. `pnpm build` **after** step 9, because the public values are inlined into the bundle. Then
    restart.
11. In the MPC portal, register the webhook at `https://<domain>/api/v1/webhooks/nmi`, and copy its
    signing key into `NMI_WEBHOOK_SIGNING_KEY_LIVE`. Restart if the key changed.
12. Verify: health shows `paymentEnvironment=production`; the `/checkout` page source loads Collect.js
    from MPC; the browser console shows no CSP violations; one webhook delivery is stored with a
    valid signature.

---

## 7. Checked and found correct

- **`NMI_ENVIRONMENT` is validated at startup** through the config package (`env.ts:33`) and is
  never read raw at the point of use.
- **Secrecy boundary holds** (§4). No hardcoded or demo keys exist in the tree or its history.
- **Webhook raw-body verification is correct in order.**
  - The body is read once as text (`route.ts:18`), after only a `content-length` check.
  - The signature is verified over `` `${t}.${rawBody}` `` (`client.ts:418-419`) with a
    constant-time, length-checked compare (`client.ts:421-424`).
  - `JSON.parse` happens only after verification (`webhooks-nmi.ts:51` then `:58`).
  - The middleware touches headers only (`apps/web/src/middleware.ts:6-31`).
  - nginx is documented not to re-serialise bodies (`docs/DEPLOYMENT.md:70`).
  - The residual hardening is listed in F7.
- **Credentials are trimmed** at the boundary (`payments.ts:34-36`). A config failure is reported
  as `auth`, not "may have charged" (`client.ts:69-77`).
- **Webhook path and rate-limit exemption** are consistent across the code, the OpenAPI spec and
  the docs (`security.ts:50`, `docs/HANDOVER.md:22`, `docs/CUTOVER-PLAN.md:28`).
- **Square is gone from all code paths.**
  - There are no imports, no dependencies (`package.json`, `pnpm-lock.yaml`), no `SQUARE_*`
    variables in `env.ts`, `.env.example` or local `.env`, and no Square CSP hosts.
    `security.test.ts:43` and `packages/notify/src/templates.test.ts:159` assert this.
  - Surviving mentions in code are explanatory comments only (`checkout.ts:123, 536`,
    `client.ts:39`, `types.ts:89`, `errors.ts:19`, `test-cards.ts:7`, `nmi-payment-form.tsx:106`,
    two tests, and one migration header).
  - The docs could confuse a cutover:
    - `docs/SPRINT-16-OPERATOR.md:7, 41, 81, 87` tell the operator to "look each pair up in Square".
      That is right for Sprint 16-era orders, but it needs a note for post-cutover orders.
    - `docs/WALLET-VERIFICATION-CHECKLIST.md:21-60` still lists `NEXT_PUBLIC_SQUARE_*` and Square
      CSP hosts (it is marked superseded at `:6`).
  - Also outstanding: rotating the "revoked-but-still-present" Square token
    (`docs/SPRINT-17-NOTES.md:416-417`).
- **The local `.env` parses identically** under `dotenv` and `--env-file`. The Sprint 17 spacing
  trap is not present.

---

*Processes: only foreground `git`, `grep`, `awk` and two offline `node -e` parse checks; all
exited. No network call was made to any NMI or MPC host.*
