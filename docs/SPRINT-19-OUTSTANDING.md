<!-- SPRINT-19: left for the operator, found and not fixed, and what carries over from 18.x. -->

# Sprint 19: outstanding

## 0. Check live card orders now (independent of wallets)

Sprint 19 found and fixed a checkout defect in the card path (notes §8.0). The page sent the cart, tip, order note
and **billing ZIP as they were when the email was last typed**. Anything entered after the email was not sent. On a
normal top-to-bottom fill, that means:

- **the AVS ZIP was probably missing** from most live card sales since 18.3;
- **a tip chosen after the email was not charged.**

Please check:

1. `PaymentAttempt.avsResponse` on recent live sales, for the pattern a missing ZIP produces.
2. Whether order `tipCents` matches what customers say they chose.
3. Whether any kitchen notes are missing.

This deploys with the Sprint 19 code even while both wallet flags stay off.

## Before either flag goes on (operator, Phase 7)

1. **Merchant Pay Connect must confirm in writing that each wallet is enabled for this MID.**
   Nothing in this sprint contacted MPC. Every Collect.js wallet fact the code relies on comes from
   NMI's public docs and from reading NMI's sandbox `Collect.js` build (`docs/SPRINT-19-NOTES.md`
   §0.9 and §3). Ask MPC these questions and get the answers in writing:
   - Is Apple Pay enabled for this processor, under *Settings → Apple Pay*?
   - Is Google Pay on without further setup?
   - Does MPC's hosted `Collect.js` mount the wallet buttons from `https://collectcheckout.com`, as
     NMI's build does? If it uses another host, the Google Pay CSP entry in
     `packages/config/src/nmi-gateway.ts` (`WALLET_ORIGINS.collectWalletFrames`) must change before
     the flag goes on.
   - Does the gateway hold a wallet sale to the amount the customer authorised? The server enforces
     this anyway. This question is about whether a second guard exists.
2. **Verify the association file through the proxy, then register the domain.** Run the `curl` in
   `DEPLOYMENT.md` §3. It must return **200**, directly and not via a redirect, with SHA-256
   `6e6bea7f8889670155ec616394f08cff3c782e170f76db38c89ffdfe19107d51`. Then register
   **`haroldsburnham.com`** under *Settings → Apple Pay* in the MPC portal. Do not register `www`,
   because it redirects to the apex and never serves checkout.
3. **Copy `public/` with its dot-directories** when deploying the standalone tree
   (`cp -a apps/web/public/. …`, `DEPLOYMENT.md` §2). A `public/*` glob silently leaves the
   association file out.
4. **Run the migration before the deploy:** `pnpm db:migrate:deploy` applies
   `20260926120000_sprint19_payment_method`. It is additive, and existing attempts become `card`. The
   reverse is `packages/db/prisma/rollbacks/20260926120000_sprint19_payment_method.down.sql`.
5. **Your local `.env` has `PAYMENTS_GOOGLE_PAY_ENABLED=true` (line 32).** That's fine for a
   development machine on the sandbox. The production `.env` must say `"false"` until step 1 is done.

## Found and not fixed

1. **A pending order that predates a price change is a trap for wallets, and was already a trap for
   cards.** Retrying with the same idempotency key, or inside the 180 s duplicate-guard window,
   returns the *existing* pending order, which keeps its original total.
   - **Card:** that stale total is charged silently. This is pre-existing and not changed here.
   - **Wallet:** the amount check refuses every retry (`WALLET_AMOUNT_MISMATCH`), because the sheet
     now shows the new quote. The refusal persists until the key changes (a cart edit) or the
     guard window passes.
   - **Why it wasn't fixed:** fixing it means abandoning or repricing the stale pending order, which
     is an order-state change and out of scope. It is rare, because it needs a menu, tax or
     tip-preset change during a checkout.
2. **A tip change while paying by card doesn't redraw the wallet buttons**, and that is deliberate:
   redrawing clears a half-typed card. The reconfigure happens when a wallet tab is selected. That
   redraw **clears any card details already typed**, so a customer who switches Card → Apple Pay →
   Card re-enters their card. The ZIP they typed is kept.
3. **No DOM-level test of the tabs.** There is no browser test harness in this repository. The
   rules are pure functions with tests (`payment-methods.test.ts`). The 360px fit was measured in
   headless Chrome. Keyboard behaviour is proven at the function level only.
4. **The sheet lock is a best effort.** Collect.js reports neither a sheet opening nor a
   cancellation. The page infers them from a press on Apple's in-page button, from the window losing
   focus to Google's iframe, and from focus or a touch coming back. The server's amount check is the
   guarantee behind it.
5. **`fieldsAvailableCallback` never fired** in headless Chrome against the NMI sandbox, card-only
   or with wallets. The pre-existing "Loading the secure payment form…" line depends on it. Watch
   for that line staying up in real browsers.
6. **Permissions-Policy.** The header does not mention `payment`, so the browser default applies.
   Collect.js's Google Pay iframe carries `allowpaymentrequest`. If Chrome's console reports a
   payment-permission violation in Phase 7, add `payment=(self "https://collectcheckout.com")`.
   Leaving it out keeps the header identical with both flags off.

## Deferred (not in this sprint's scope)

1. **Venmo and PayPal** are not supported through NMI and would need a separate provider. Cash App
   Pay, ACH and Buy Now Pay Later are also out of scope.
2. **Migrating from Collect.js to NMI's Payment Component.** NMI's own wallet page now says new
   integrations should use it.
3. **The payment method on the kitchen ticket and the thermal receipt.**
4. **AVS and CVV rejection rules.** The 18.3 decision stands, and wallet attempts are recorded the
   same way.
5. **`docs/WALLET-VERIFICATION-CHECKLIST.md`** is still the Square-era text (18.2 carry-over).
   Sprint 19's Phase 7 steps live in `docs/SPRINT-19-NOTES.md` §9 instead. Rewrite or delete the
   old file.

## Carried over from 18.x, still open

1. 18.3: the Prisma checksum mismatch on `20260919120000_sprint18_seo`. This sprint used
   `migrate diff` + `migrate deploy` again.
2. 18.3: `docs/Merchant Pay Connect INC-Direct-Post-API.md` contains NMI's public demo key
   (l.1530) and is untracked. Keep it out of git.
3. 18.3 listed lint errors in `packages/db` and `packages/notify`. **`pnpm lint` exits 0 in this sprint's
   runs**, so they appear to have been fixed since. They are not re-listed.
4. 18.3: `merchant_advice_code`, and no processor response code.
5. 18.2: rotate the local `_LIVE` triple; the revoked-but-present Square token; no MPC test
   environment; `pnpm reconcile` not yet run; the unused `eventType` in `webhooks-nmi.ts`; mock
   health missing `paymentGatewayOrigin` / `collectJsUrl` (and now `wallets`).
