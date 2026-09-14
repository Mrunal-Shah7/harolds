<!-- SPRINT-9: threat model, controls, residual risks, credential rotation, incident response. -->

# Security — Harold's Chicken Oak Lawn

Pickup-only guest checkout. No customer accounts. Card numbers never touch this system.

This document is the operator's security posture, not a PCI attestation and not a penetration-test report.

---

## 1. Threat model (plain terms)

### What this system holds that is worth attacking

- **The ability to take money.** A caller who can create orders against the gateway charges a real card (the customer's, via NMI's hosted fields — or, if they exploit a sandbox/production mix-up, a live merchant account). Rate limits, cart validation, and the per-order charge claim exist so volume and replay are expensive, not free. NMI has NO idempotency key, so that claim is the only replay defence.
- **The ability to change what is sold and for how much.** An admin session can edit prices, sold-out flags, hours, and refunds. That session is a password cookie, not a kitchen PIN.
- **Customer phone numbers and email addresses** on paid orders. The email address receives the receipt; the phone is kept so the counter can call about a collection. Neither is a marketing list, and since Sprint 18 nothing texts the customer at all.
- **Kitchen and admin credentials.** PINs and passwords, stored as scrypt hashes. Session tokens stored as SHA-256 hashes.
- **Provider credentials** in the server environment: NMI, Resend, the print shared secret, the database URL.

### What this system deliberately does not hold

- **Card numbers, PANs, CVVs, or magnetic-stripe data.** The browser talks to NMI Collect.js, which mounts the card fields as iframes on the gateway's own origin. The server receives a single-use `paymentToken` and an amount in integer cents. PCI scope is limited by architecture, not by paperwork.
- **Customer passwords or customer accounts.** Checkout is guest-only. There is nothing to stuff or reset on the public surface.
- **Delivery addresses.** Pickup only.
- **Saved cards or wallets.** Every payment is a new Collect.js token, valid for a single submission.

An attacker who dumps the database gets menu, orders, redacted-able PII, and password/PIN hashes. They do not get cards.

---

## 2. Controls in place

| Area | Control |
|---|---|
| Public API | Cart validation at the boundary (Sprint 3). Authoritative repricing. Integer cents. |
| Orders | Per-source rate limit. Client idempotency key + the atomic per-order charge claim (`Order.chargeClaimedAt`) + webhook `eventId`. |
| Quote | Tighter unauthenticated POST limit (20 / 60s). Body cap 32 KiB before parse. |
| Auth | Kitchen PIN lockout (Sprint 6) plus per-source sign-in limit. Admin password lockout (Sprint 8) plus per-source sign-in limit. Distinct errors for lock vs wrong secret. |
| Admin | Role checks on every `/api/internal/admin/*` handler. Kitchen sessions cannot refund. Audit log. httpOnly `harolds_admin` cookie, SameSite=lax, Secure in production. |
| Kitchen | Session token in kiosk `localStorage` (survives reload on a mounted tablet). Bearer on the API. Queue poll is not rate limited. |
| Print | Shared secret required. Invalid secret → 401 with no serial disclosure. Idle polls log at debug. |
| SQL | Prisma parameterised queries. The three raw SQL sites (order numbers, job claim, print claim) use tagged templates, never string interpolation. |
| Output | ePOS-Print XML escaped. Email HTML escaped. Admin/kitchen React text nodes (no `dangerouslySetInnerHTML` for customer content). |
| Transport | HTTPS redirect when `TRUST_PROXY=1` and `X-Forwarded-Proto: http`. HSTS when production and HTTPS. Node remains HTTP behind nginx. |
| Browser | CSP built for NMI Collect.js, `X-Frame-Options: DENY`, `nosniff`, referrer policy, permissions policy. |
| CORS | Real API does not send `Access-Control-Allow-Origin`. The mock API still does (`origin: *`) for local UI work. |
| Logs | JSON lines, request id, field-name redaction. Polls at debug. |
| Health | `GET /api/v1/health` is 200 only when the database answers `SELECT 1` and the in-process worker has run within `WORKER_STALE_MS` (default 30s). Otherwise 503. Unauthenticated and cheap. |
| Backups | `pnpm backup` → custom-format `pg_dump`. Restore is `pnpm backup:restore <dump> <other-db>`. The live name `harolds` is refused as a restore target. |

Rate limiting is **in-process**. Production is one long-lived Node process. Redis is not required for v1. The same reasoning governed the Sprint 2 menu cache and the Sprint 7 job queue.

---

## 3. Residual risks (stated honestly)

1. **The print shared secret sits in the printer's URL query string.** The TM-m30III firmware does not send Digest authentication reliably (Sprint 5). A secret in a query string is written to every access log along the path unless the reverse proxy is configured to omit it for `/api/v1/print/` (see `docs/PRINT-RUNBOOK.md` §6). Anyone who can read those logs, the printer's configuration page, or a packet capture of the poll still has the secret. An invalid secret is refused without revealing whether the serial is known. This is mitigated, not solved.
2. **CSP includes `'unsafe-inline'` and `'unsafe-eval'`** so Next.js App Router hydration works without per-request nonces. That is weaker than a nonce-based policy. The gateway's frames and scripts (`secure.nmi.com`, `sandbox.nmi.com`) are allowed by design — both hosts, because the CSP is a static header and the active one changes with `NMI_ENVIRONMENT`. `applepay.cdn-apple.com` is also allowed on `script-src`: Collect.js injects Apple's SDK itself, in its constructor, and cannot be told not to.
3. **Kitchen session tokens live in `localStorage`.** A kiosk XSS (or a stolen tablet) is a kitchen session. Admin uses an httpOnly cookie instead because that surface can refund money and change prices.
4. **In-process rate limits reset on process restart** and do not coordinate across multiple Node processes. v1 is one process. If Sprint 10 ever runs more than one, this must be revisited.
5. **`TRUST_PROXY=1` must only be set behind a proxy that overwrites `X-Forwarded-For`.** If it is on and the proxy appends rather than overwrites, a client can spoof the left-most address and evade per-source limits.
6. **Sentry is optional.** If `SENTRY_DSN` is empty, errors stay in the process ring buffer and the structured log. That is a configuration gap, not a code gap.
7. **External uptime monitoring is not wired until the production domain exists (Sprint 10).** The health endpoint is ready. The independent alert path (UptimeRobot / equivalent → manager phone, not Resend) is not yet subscribed.
8. **Seeded test staff accounts** exist in development. They must be deactivated before a live shift.

---

## 4. Secret inventory

Held only in environment configuration (root `.env`, gitignored). None have a working default in code — missing required values refuse to start.

| Secret | Variable | Working default in code? |
|---|---|---|
| Database URL | `DATABASE_URL` | No |
| NMI security key | `NMI_SECURITY_KEY_SANDBOX` / `NMI_SECURITY_KEY_LIVE` | No |
| NMI webhook signing key | `NMI_WEBHOOK_SIGNING_KEY_SANDBOX` / `NMI_WEBHOOK_SIGNING_KEY_LIVE` | No |
| NMI tokenization key | `NMI_TOKENIZATION_KEY_*`, `NEXT_PUBLIC_NMI_TOKENIZATION_KEY` | Yes — public by design (Collect.js runs in the browser). It is NOT a secret; the security key is. |
| Print shared secret | `PRINTER_SDP_SHARED_SECRET` | No |
| Email API key | `EMAIL_API_KEY` | No (optional until live send) |
| Error tracker DSN | `SENTRY_DSN` | No (optional; empty means local capture only) |
| Admin/kitchen session material | generated per sign-in; hashes in DB | N/A |

Glance checks for the running environment:

- `GET /api/v1/health` → `paymentEnvironment` (`sandbox` \| `production`) and `nodeEnv`.
- Process start log `app.start` includes `nodeEnv`.
- `NMI_ENVIRONMENT` is required as an explicit enum, not inferred from the key. It also selects the gateway HOST: a sandbox account is rejected outright by `secure.nmi.com`.

`.env.example` documents every variable. Empty strings in the example are documentation, not code fallbacks. `parseEnv` rejects empty required secrets.

---

## 5. Credential rotation

Generate a print secret with `node scripts/rotate-print-secret.mjs` (32 random bytes, base64url).

| Credential | Downtime | Procedure |
|---|---|---|
| `DATABASE_URL` password | Brief | Create a new role/password in Postgres, update `.env`, restart Node, drop the old password. Connections drain on restart. |
| `NMI_SECURITY_KEY_*` | None if the new key is valid first | Create a new security key in the NMI Control Panel, put it in `.env`, restart Node, revoke the old key. |
| `NMI_WEBHOOK_SIGNING_KEY_*` | Coordinated | NMI issues a new signing key when the webhook subscription is rotated. Update `.env` and the Control Panel in the same window. Signature failures return 401; NMI retries. Do not run two keys in code in v1 — keep the window short. |
| `PRINTER_SDP_SHARED_SECRET` | Kitchen tickets pause until both sides match | Set the new secret in `.env`, restart Node, set the same value on the printer Server Direct Print page (URL `?key=`). Invalid secret → 401, empty body, no serial leak. Old polls fail until the printer is saved. |
| `EMAIL_API_KEY` | None | Rotate in Resend, update `.env`, restart. |
| `SENTRY_DSN` | None | New DSN in `.env`, restart. Old project keys can be revoked after. |
| Kitchen PIN / admin password | None | Owner resets from `/admin/staff`. Existing sessions can be revoked. |
| Admin session cookie | None | Sign out or revoke sessions. Cookie is httpOnly; rotation is "revoke + sign in again". |

Production credentials must never be pasted into the sandbox `.env`, and the reverse. Health's `paymentEnvironment` is the glance check before a live shift. Both key triples live side by side in `.env`; only the triple matching `NMI_ENVIRONMENT` is read or validated.

---

## 6. Log redaction and retention

`emitLog` / `redactFields` redact by **field name** (password, pin, token, secret, email, phone, card, DSN, `key` query params, and related). A later author who logs `{ pin: enteredPin }` still emits `[redacted]`.

Production `LOG_LEVEL=info`. Printer polls (every 5s) and unknown-serial polls log at **debug**, so they do not dominate the disk.

Suggested production logrotate (Sprint 10 applies it on the server):

```
/var/log/harolds/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
```

Stdout of the long-lived Node process should be captured by the process supervisor into that directory. Fourteen days matches backup retention.

---

## 7. Backups and migrations

- **Schedule (production, Sprint 10 cron):** daily `pnpm backup` (custom-format `pg_dump`), copy off the database disk (object storage or another host). A backup on the same disk as Postgres survives corruption of a table; it does not survive disk loss.
- **Retention:** at least 14 days.
- **Restore:** `pnpm backup:restore <file.dump> harolds_restore_YYYYMMDD` — the script refuses the live database name `harolds`.
- **Before any production migration:** take a backup. Sprint 5's hand-written check constraint is the reminder that migrations here are not always purely generated. Development `pnpm db:migrate` may prompt to reset; production uses `pnpm db:migrate:deploy` only, which never resets.

---

## 8. Incident response (suspected compromise)

1. **Contain.** Restart is not enough if the secret leaked. Rotate the print secret, NMI security key, NMI webhook signing key, email key, and database password (table above). Revoke all admin and kitchen sessions from `/admin/staff` (or SQL on `AdminSession.revokedAt`).
2. **Preserve.** Copy current logs and the latest backup off the box before you wipe anything.
3. **Scope.** Search structured logs by `requestId` / `orderId`. Check `AdminAuditLog` for unexpected price, refund, and staff changes. Check the NMI Control Panel for charges that have no matching paid order (`pnpm reconcile --hours 24`).
4. **Customer impact.** If phones/emails leaked, that is a PII incident — notify as required. Card data was never stored here; NMI's incident process applies if their tokenisation was involved.
5. **Printer URL.** If access logs included `?key=` before the nginx `combined_no_query` change, treat the print secret as leaked and rotate it.
6. **Return to service** only when health is 200, a sandbox (or live, if that is the environment) test quote succeeds, and the printer polls authenticated again.

Do not use the application's own email path as the only way to tell a human the application is down. Since Sprint 18 it is the ONLY channel the app has, which makes this more important, not less. External uptime monitoring (Sprint 10) is the independent path.

---

## 9. Sessions — two surfaces, two decisions

| Surface | Storage | Why |
|---|---|---|
| Kitchen display | `localStorage` token + `Authorization: Bearer` | A mounted kiosk must survive a reload without re-entering a PIN mid-ticket. Privilege is kitchen status changes, not refunds. |
| Admin back-office | httpOnly cookie `harolds_admin` | Can refund, change prices, manage staff. Cookie flags: httpOnly, SameSite=lax, Secure in production, path `/`. |

These are inconsistent on purpose.
