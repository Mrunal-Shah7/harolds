<!-- SPRINT-10: cutover plan written before execution. Not executed — production host and storefront missing. -->

# Cutover plan — Harold's Chicken Oak Lawn

**Status: written, not executed.** Timing: quietest hour of the quietest day (suggested: Monday after close, store-local). Point of no return is marked below.

Every step is reversible until the point of no return. Rollback is in the same row.

---

## Decision: previous ordering path (must be explicit)

**Default recommendation (not yet accepted by the business):** keep the third-party marketplace listing for discovery; send repeat customers to the owned site. Commission on new customers is acceptable; commission on regulars is not.

Redirects from any old owned URL, if one exists, go to `https://<domain>/`. Marketplace listing is not a redirect we control.

**Record the actual decision here when the owner chooses.** Until then, do not take the marketplace down.

---

## Order of steps

| # | Step | Who | Verify | Rollback |
|---|---|---|---|---|
| 1 | Backup production DB; confirm last off-box dump | Developer | File exists off-box; restore drill already succeeded on this server | N/A |
| 2 | Production `.env` is production-only (Square env glance) | Developer | health `squareEnvironment=production` | Revert `.env`, restart |
| 3 | Rotate print secret; set printer SDP URL to `https://<domain>/api/v1/print/poll?key=…` | Developer + whoever has the printer web page | Printer last-polled on Dashboard within 10s | Point printer back at previous URL; restore previous secret in `.env` |
| 4 | Square webhook subscription = `https://<domain>/api/v1/webhooks/square` (exact path, not `/`) | Developer | Dashboard delivery 2xx; one test event stored | Repoint subscription at previous URL |
| 5 | Kitchen PWA reinstalled from `https://<domain>/kitchen` | Kitchen lead | Board loads; PIN works; audio unlock chirp | Open previous origin (do not leave both installed) |
| 6 | Staff dry run complete; test charges refunded | Kitchen + manager | Notes in SPRINT-10 | Stay dark; do not publish the URL |
| 7 | DNS / listings point at the new site | Owner | Site loads on **mobile data**, not store Wi-Fi | DNS TTL should be low (5 min) beforehand; revert A record |
| 8 | **Point of no return:** first real customer can reach checkout | — | — | After this, refund + reprint + status correction; do not silently take the site down mid-order |

---

## First-service watch

For each of the first real orders: payment captured, ticket printed, card on KDS, confirmation SMS/email, customer collected food. Someone who can refund, reprint, and correct status stays available for the first service.

---

## If rollback is required after go-live

1. Pause accepting orders in `/admin` (Store).
2. Do not destroy paid orders. They still need to cook.
3. Revert DNS only after in-flight paid orders are done or staff are working them from `/admin`.
4. Leave the printer on production until those tickets have printed.
5. Write what failed in `docs/SPRINT-10-NOTES.md` before changing anything else.
