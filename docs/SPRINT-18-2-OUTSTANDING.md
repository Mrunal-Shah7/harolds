<!-- SPRINT-18.2: found and not fixed, and what only the operator can do. -->

# Sprint 18.2: outstanding

## Operator: Phase 8 cutover (deploy alone, in its own watch window)

The code is ready, and nothing below has happened yet. The brief's Phase 8 steps stand, with two
changes that follow from Option A:

- **No public variable to set, and the rebuild order is no longer load-bearing for the gateway.**
  Set `NMI_ENVIRONMENT="production"` and the MPC `_LIVE` triple (generated under `harolds-api`),
  then build this sprint's code and restart. Delete any `NEXT_PUBLIC_NMI_*` lines; nothing reads
  them.
- **The glance check is health's three fields:**
  - `paymentEnvironment: production`
  - `paymentGatewayOrigin: https://mpc.transactiongateway.com`
  - `collectJsUrl` on that origin

  Then view the `/checkout` source for the MPC Collect.js URL, and check the browser console for
  CSP violations.

The first real webhook delivery is the first test of the HMAC scheme against MPC. If it fails, the
`webhook.signature_verification` log line gives the reason, body size, and nonce and digest lengths
without exposing any of them.

## Open

1. **No MPC test environment.** MPC confirmed there is none. The sandbox branch exercises the code
   path against a generic NMI sandbox account, not the real integration. Nothing about MPC is
   exercised until the one real card in Phase 8. If MPC ever offers one, change the sandbox origin
   in `packages/config/src/nmi-gateway.ts` and its pin test.
2. **Rotate the local `_LIVE` triple.** The local `.env` holds correctly shaped live values that
   predate the scoped `harolds-api` user and carry the owner's permissions (18.1 finding F9). Revoke
   them in the MPC portal, and generate the production triple under `harolds-api`, on the
   production server only.
3. **Square operator-doc cleanup:**
   - `docs/SPRINT-16-OPERATOR.md` (lines 7, 41, 81, 87) tells the operator to "look each pair up in
     Square". That's correct for Sprint 16-era orders, but it needs a note that post-cutover orders
     are looked up in the MPC portal.
   - `docs/WALLET-VERIFICATION-CHECKLIST.md` is marked superseded, but it still lists
     `NEXT_PUBLIC_SQUARE_*` and the Square CSP hosts.
4. **Square token still needs rotation.** The revoked-but-still-present Square token
   (`SPRINT-17-NOTES.md` §16.6) is still outstanding.
5. **Flaky `packages/db/src/kitchen-alerts.test.ts`.** It failed in 4 of 7 runs this sprint,
   including at baseline. `enqueueUnacknowledgedKitchenAlerts` sweeps every paid order in the
   database, and the test asserts exact counts while other `packages/db` test files create paid
   orders concurrently. A fix would scope the assertions to the test's own order ids, or run that
   file alone. It's pre-existing and outside this sprint.
6. **Five pre-existing lint errors:** unused imports in `packages/db/src/order-status.ts`,
   `order-status.test.ts`, `packages/notify/src/handlers.ts` and `templates.test.ts`. They survived
   because Sprint 17 had no uncommitted diff to take them away.
7. **`openapi:validate` expects `info.version` 1.2.0; the spec says 1.3.0** (pre-existing, Sprint 17
   open item 10). Because the validator fails first, `openapi:validate` never reaches the drift
   check, which passes when run on its own.
8. **`pnpm reconcile` has not been run with its new `--env-file`.** Running it calls the Query API,
   so it waits for Phase 8 step 7.
9. **`webhooks-nmi.ts`: unused `eventType` parameter** (lint warning, Sprint 17 open item 8).
   Untouched.
10. **Mock API health** (`packages/mock-api/src/server.ts:444`) does not return the two new additive
    health fields. Clients must treat them as optional, which the OpenAPI description allows.
