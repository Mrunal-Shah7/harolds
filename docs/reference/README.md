# Reference: the sprint-era docs

_Restored on 2026-11-19 from commit `448777d` (they had been deleted from `docs/` in the working tree). Kept as
they were, for background (the only edit: one link in `API-CONTRACT-HANDOFF.md` now points at `../openapi/v1.yaml`): architecture decisions, runbooks, the deployment procedure, security posture
and the notes of Sprints 1 to 19._

**They are not the source of truth.** Behaviour is described in [../system-review/](../system-review/README.md),
the product on one page in [../system-map.md](../system-map.md). Where these files disagree with the code, the code
wins, and the disagreement is a `[question]` in the system review. Several are already out of date: they name the
store "Oak Lawn" (the live store is Burnham), and [LAUNCH-BLOCKERS.md](LAUNCH-BLOCKERS.md) and
[CUTOVER-PLAN.md](CUTOVER-PLAN.md) say there is no production server, while the site is live.

| File | Holds |
|---|---|
| [HANDOVER.md](HANDOVER.md) | The pre-cycle technical handover: shape, decisions that look strange, monitoring, deferred work |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Ubuntu server, systemd, nginx, deploy procedure and rollback |
| [SECURITY.md](SECURITY.md) | Threat model, controls, residual risks, credential rotation |
| [CUTOVER-PLAN.md](CUTOVER-PLAN.md), [LAUNCH-BLOCKERS.md](LAUNCH-BLOCKERS.md) | Go-live plan and blockers (written before launch) |
| [OPERATOR-HANDBOOK.md](OPERATOR-HANDBOOK.md), [ADMIN-OPERATOR-GUIDE.md](ADMIN-OPERATOR-GUIDE.md), [KITCHEN-KIOSK-RUNBOOK.md](KITCHEN-KIOSK-RUNBOOK.md), [PRINT-RUNBOOK.md](PRINT-RUNBOOK.md) | Store operations |
| [API-CONTRACT-HANDOFF.md](API-CONTRACT-HANDOFF.md), [STOREFRONT-REQUIREMENTS.md](STOREFRONT-REQUIREMENTS.md) | Public API contract notes and storefront requirements |
| [END-USER-VERIFICATION-CHECKLIST.md](END-USER-VERIFICATION-CHECKLIST.md), [harolds-verification-checklist.md](harolds-verification-checklist.md), [WALLET-VERIFICATION-CHECKLIST.md](WALLET-VERIFICATION-CHECKLIST.md) | Earlier manual checklists (the wallet one is Square-era and stale) |
| `SPRINT-*-NOTES.md`, `SPRINT-*-OUTSTANDING.md`, `SPRINT-16-OPERATOR.md`, `SPRINT-18-1-NMI-AUDIT.md` | What each sprint built, checked and left open |
| `Merchant Pay Connect INC-Direct-Post-API.md` | The gateway reseller's API document |
| `design/`, `sprint11-kitchen-ticket-preview.txt` | Design baselines and a ticket preview |

The two files code reads stay where the code expects them: [../harolds-menu-reconciliation.xlsx](../harolds-menu-reconciliation.xlsx)
(the menu seed, `packages/db/src/seed/workbook.ts`) and [../openapi/v1.yaml](../openapi/v1.yaml) (the public API
contract, `apps/web/scripts/openapi-validate.ts`).
