# Build note: set up the development cycle (TR-001)

Branch `chore/tr-001-setup-cycle`, from `master` (`448777d`). Built 2026-11-20. Not merged: the owner chose to keep
it off `master` for now.

## Problem

The starter kit had been copied into the repository, but `CLAUDE.md` and the docs were still templates,
`SDLC-GUIDE.md` was missing, and the sprint-era docs had been deleted from `docs/` in the working tree.

## Cause

Nothing in the product was wrong: the cycle's documents had not been written from this repository yet.

## Change

- **Product code:** none.
- **Kit:** `SDLC-GUIDE.md` copied in from `../SDLC/`.
- **Rules:** `CLAUDE.md` filled in (commands with healthy output, conventions with example files, safety);
  `REVIEW.md` lists the generated paths.
- **Docs:** `docs/system-map.md`, nine reviews in `docs/system-review/`, `docs/testing.md`, the smoke checklist,
  the index `docs/README.md`, `docs/triage.md` (TR-001 to TR-015), `docs/handover.md`, the run log
  `docs/runs/2026-11-19-smoke.md`.
- **Moved:** the 47 sprint-era docs deleted from `docs/` were restored from `448777d` into `docs/reference/` (one
  link fixed in `API-CONTRACT-HANDOFF.md`). The menu workbook and `docs/openapi/v1.yaml` stay at their old paths
  because code reads them. `docs/HANDOVER.md` is renamed to `docs/handover.md` in git. The root `README.md` links
  point at `docs/reference/`.

## How it was checked

- **Commands (2026-11-19):** typecheck exit 0; lint exit 0, 11 warnings; tests 656 passed, 0 failed;
  `openapi:validate` "12 paths, 11 error codes, version 1.4.0"; `db:verify` "All invariants passed."; build
  "Compiled successfully"; `format:check` fails (TR-008, not caused here). `node scripts/check-docs.mjs`:
  `docs: no findings`.
- **Hands-on:** the smoke checklist on a local dev server in the built-in browser, NMI sandbox, email and Sentry
  switched off: 15 of 15 pass ([run log](../../runs/2026-11-19-smoke.md)).
  - **The way back:** the test order was refunded in admin; the sold-out flag was set back; admin and kitchen
    sign-out checked.
- **Production:** read-only aggregate queries through Tamery "OVH" for TR-005, TR-006, TR-013, TR-014; no writes.
- Test data created was removed: not possible for the test order (orders cannot be deleted); HC-001 stays in the
  local database as `REFUNDED`.

## Found while building

- Opened TR-002 to TR-015; TR-005, TR-006, TR-013 and TR-014 are closed with their reasons in the triage log.

## Not checked

- Nothing on the production server itself (deploys, backups, nginx). No module checklists exist yet; only the
  smoke pass was walked.
- No system-review statement is mapped to a named test yet, so none is marked `[tested]`.

## Way back

Revert the commit, or delete the branch. Only documentation changed; no data or product behaviour depends on it.
