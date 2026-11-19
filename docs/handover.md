# Handover

_Where the work stopped and how to pick it up. Newest first; the next session reads "In progress" and the top
entry before anything else. This file keeps the latest five entries; older ones are in
[handover-archive.md](handover-archive.md)._

## In progress

_One line per open branch: `` `branch` `` (TR-nnn, change NNN): what is left. Added when the branch is cut,
removed after it merges._

- `chore/tr-001-setup-cycle` (TR-001): the cycle setup, committed; not merged into `master` by the owner's
  choice. Left: a pull request when the owner wants it merged.

## 2026-11-19 - set up the development cycle (TR-001)

- **Done:** filled in `CLAUDE.md`, [system-map.md](system-map.md), nine system reviews in
  [system-review/](system-review/README.md), [testing.md](testing.md), the smoke checklist, the
  [index](README.md), `REVIEW.md`'s generated paths and the [triage log](triage.md) (TR-001 to TR-012). Copied the
  missing `SDLC-GUIDE.md` in from `../SDLC/`. Restored the 47 deleted sprint-era docs from `448777d` into
  [reference/](reference/README.md), except the menu workbook and `openapi/v1.yaml`, which went back to their
  original paths because code reads them. Pointed the root `README.md`'s doc links at `docs/reference/`. Ran every
  check (install, generate, typecheck, lint, test, openapi, verify, build, format) and walked the smoke checklist:
  [runs/2026-11-19-smoke.md](runs/2026-11-19-smoke.md), 15 of 15 pass. Nothing committed.
- **Later the same session:** the owner answered the open questions (wallets on, `TRUST_PROXY=1`, Node v22.23.2
  and pnpm 9.15.0 in production, no backups ever, no "ready" email wanted) and gave read-only access to the
  production database (Tamery "OVH"). From it: TR-005 closed (6 card sales without the ZIP, fixed since Sprint
  19), TR-006 closed (local database only), and three new lines: TR-013 (35 kitchen cancels, none refunded),
  TR-014 (96 "unacknowledged" manager emails for 103 orders), TR-015 (no backups). The handover file is renamed
  in git (`git mv -f docs/HANDOVER.md docs/handover.md`, staged, not committed).
- **Left for the owner:**
  - TR-015: take an off-box backup of the production database now (`pnpm backup` on the server, then copy the dump
    off the box) and try a restore into a separate database.
  - Answered already: the 35 kitchen cancels were staff clearing fulfilled orders (TR-013), the board stays for
    later use, and the "unacknowledged order" email is left as it is for now (TR-014 closed as deferred, later
    work T-010).
  - The remaining questions in the [index](README.md#questions).
  - Decide whether the 47 deleted files under `docs/` are committed as deleted (their copies are in
    `docs/reference/`).
- **Next:** put TR-002 (the development guard against real email and Sentry) through the full path as the first
  real task.
- **Still running:** nothing. The dev server is stopped and port 3000 is free. The built-in browser still has a
  tab open on `http://localhost:3000/kitchen`.
- **Settings changed and not put back:** none in `.env` or the product. In the local database: test order HC-001
  (`REFUNDED`) stays; the 7 jobs that were waiting failed against the dummy key and will go dead; "2 PC Whole
  Dinner" was set sold out and back to available.
- **Slowed down by:**
  - The global pnpm (11.x launcher) hung twice for about 15 minutes on `install` with no output; `npx
    pnpm@9.15.0` installed in 5 s. Now in `CLAUDE.md` "Commands" and [testing.md](testing.md).
  - On Windows an empty environment variable is dropped, so `EMAIL_API_KEY=""` does not override `.env`; the run
    needs a non-empty dummy value. Now in [testing.md](testing.md) and the "Run locally" command.
  - `SDLC-GUIDE.md` was missing from the copied kit and was found in `../SDLC/`: not likely to repeat.

<!--
Entry format. Copy it above the newest entry at the end of every session.

## YYYY-MM-DD - what the session was about (TR-nnn, PR n)

- **Done:** what changed and where it is written (change folder, pull request).
- **Left for the owner:** decisions, approvals, things only the owner can run.
- **Next:** the first thing the next session should do.
- **Still running:** servers, watchers, background jobs, or "nothing".
- **Settings changed and not put back:** or "none".
- **Slowed down by:**
  - what cost time (a missing tool, a wrong assumption, a step that had to be rediscovered), and where the rule
    that prevents it now lives (CLAUDE.md section, docs/testing.md), or "not likely to repeat".
-->
