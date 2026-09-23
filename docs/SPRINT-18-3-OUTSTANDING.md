<!-- SPRINT-18.3: left for the operator, found and not fixed, and what carries over from 18.2. -->

# Sprint 18.3 — outstanding

## Operator decisions

1. **The AVS and CVV rejection policy.** Nothing is rejected on an AVS or CVV mismatch; the codes
   are recorded only. Decide after about a week of real responses, which you can read from
   `PaymentAttempt.avsResponse` / `cvvResponse` or the admin Payment attempts table. The trade-off:
   rejecting on `N` (no ZIP match) stops some fraud but also declines customers who mistyped their
   ZIP or whose issuer answers oddly. Because we send only a ZIP, a good answer is `Z` / `P` / `L`,
   not `Y`.
2. **Phase 8 cutover:**
   - Deploy alone. Before deploying, run the new migration with `pnpm db:migrate:deploy`; it adds
     `PaymentAttempt`, its enum, and one `JobType` value.
   - Confirm the portal's Billing Information now shows the ZIP and an AVS code.
   - Run one approving card and one declining card, and confirm both are readable from `/admin`
     without the portal.
3. **The parallel questions from the brief still stand.** Did a Visa or Mastercard approve? Is the
   MID boarded for e-commerce card-not-present? If declines continue with the ZIP present, the
   cause is the merchant account.

## Found and not fixed

1. **No processor response code.** The Payment API does not return one. The operator's MPC
   document has no Query API section. If the Query API exposes a processor code or text, it could
   be recorded from the lookup the webhook and reconciliation already make. That needs the Query
   API response-variable docs.
2. **`merchant_advice_code`** (Mastercard's MAC) is returned only if the account's API
   configuration enables it. Worth enabling in the portal and recording; not done.
3. **The Prisma migration checksum mismatch** on `20260919120000_sprint18_seo`. `prisma migrate
   dev` refuses and offers a reset. Probably CRLF line endings. Needs a deliberate fix, for
   example restoring the file's original bytes; never a reset against a database with real data.
4. **`docs/Merchant Pay Connect INC-Direct-Post-API.md` contains NMI's public demo security key**
   (line 1530), the tutorial-key signal the 18.1 audit scanned for. It is untracked. Keep it out of
   git, or strip that line before committing it.
5. **The MPC AVS table lists `B` twice** (address match only / AVS not available). The code is
   stored raw; confirm with MPC if a `B` ever matters.
6. **Five pre-existing lint errors**: unused imports in `packages/db/src/order-status.ts`,
   `order-status.test.ts`, `packages/notify/src/handlers.ts` (`E164`) and `templates.test.ts`.
7. **Non-US billing postal codes are refused.** The loose validator accepts US ZIPs only. For a
   pickup restaurant in Burnham that's acceptable, but a Canadian or UK card holder cannot pay.
   Revisit if it comes up.

## Carried over from Sprint 18.2, still open

1. **Rotate the local `_LIVE` triple** (18.1 F9) and generate the production triple under the
   scoped `harolds-api` user, on the production server only.
2. **Square operator-doc cleanup:** `docs/SPRINT-16-OPERATOR.md` ("look each pair up in Square")
   and `docs/WALLET-VERIFICATION-CHECKLIST.md`.
3. **The revoked-but-present Square token** still needs rotation (`SPRINT-17-NOTES.md` §16.6).
4. **No MPC test environment.** The sandbox branch tests the code path against a generic NMI
   sandbox, not the real integration.
5. **`pnpm reconcile` with its new `--env-file`** has not been run; it calls the Query API. It is
   Phase 8.
6. **`webhooks-nmi.ts` has an unused `eventType` parameter** (a lint warning).
7. **Mock API health** does not return 18.2's `paymentGatewayOrigin` / `collectJsUrl`.

**Closed by this sprint:** the flaky `kitchen-alerts.test.ts` (fixed) and `openapi:validate`'s
stale version check (fixed; the drift check runs again).
