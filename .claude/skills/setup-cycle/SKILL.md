---
name: setup-cycle
description: First-time setup of the development cycle in a repository the starter kit was just copied into - fill in CLAUDE.md, the system map, the system reviews, the testing guide and the smoke checklist from the real code. Use once, right after copying the kit, when the docs check warns that the templates are not filled in, or when the user says "set up the cycle", "set up the SDLC here", "fill in the templates".
---

# Set up the cycle in this repository

Run once. Background: `SDLC-GUIDE.md`, section 12; formats in section 7. Product code is not changed in this
step: only `CLAUDE.md` and files under `docs/`.

Rules for the whole setup:

- **Write only what you found.** Every statement comes from the code, a config file or a command you ran.
  Mark it `[code]` unless you saw it run. Never fill a placeholder with a guess.
- **Run a command before writing it down.** A command that fails, or that you could not run, is written with
  what happened, not as if it works.
- **Ask the owner what the code cannot tell you**, in one batch, after step 2: the product in a sentence and who
  it is for; who the owner and engineers are (roles); the main and integration branch names; where production
  runs and who may release; which outside services are real locally; what must never be run outside a local
  copy; how test data is marked. Carry on with what does not depend on the answers.
- **Keep what is already there.** An existing `CLAUDE.md`, README or docs folder is merged in, not overwritten;
  say what you moved where.
- A template section that does not apply is deleted from `CLAUDE.md`, and says "None" in the docs.

## Steps

1. **Check the copy.** `CLAUDE.md`, `SDLC-GUIDE.md`, `REVIEW.md`, `.claude/settings.json`, `.claude/skills/`,
   `scripts/check-docs.mjs` and `docs/` are at the repository root. If a `starter/` folder was copied in whole,
   stop and say so. Run `node scripts/check-docs.mjs` to see it works.
2. **Read the repository.** Layout, package and build files, scripts, CI workflows, environment examples,
   database schema and migrations, existing README and docs, `git log` and branches. An empty repository: say so,
   fill in what the owner tells you, and leave the rest marked "not built yet".
3. **Ask the owner** the batch of questions above.
4. **`docs/system-map.md`:** fill in every section. Try the install, build, type check, lint and test commands
   and record each one's state with today's date. Everything the cycle assumes and the project lacks (tests, a
   seed, a test environment, branch protection) goes under "What is missing".
5. **`CLAUDE.md`:** the project description, the commands table (with the healthy output you saw), the
   conventions with one example file each, the safety rules, the branch names. Keep it short: detail belongs in
   the system map. Leave the three rules sections at "None yet". No `<…>` placeholder may remain.
6. **Modules.** Propose a split of the product into modules (usually 4 to 10, by what a user does, plus one for
   the platform: sessions, permissions, jobs). Show the list and get the owner's agreement before writing.
7. **`docs/system-review/NN-module.md`:** one per module from `_template.md`, written from the code, every
   statement marked. Things that look wrong, or where two parts disagree, are `[question]` and listed under
   "Questions". Fill in the modules table and the status in `docs/system-review/README.md`.
8. **`docs/testing.md`:** how the product can be driven hands-on with the tools available in this session
   (a browser, a device, an API client), and its limits.
9. **`docs/system-review/checklists/00-smoke.md`:** from the checklist template, 10 to 15 rows covering launch,
   sign-in, each main area, and sign-out. If the product runs locally, walk it once and log the run in
   `docs/runs/`; if not, say why under "What is missing".
10. **`docs/README.md`:** the project name, the system-review table, every open question grouped by topic, and
    "Later work" (`T-nnn`) from the system map's "What is missing".
11. **`REVIEW.md`:** fill in the generated paths under "Do not report".
12. **`docs/triage.md`:** add TR-001 for this setup (`chore`, light path, verdict `change`). Problems found in
    the product while reading are separate triage lines, state `open`; do not fix them now.
13. **Handover:** write the first entry in `docs/handover.md` (use the handover skill's format), including what
    could not be filled in and why.
14. Run `node scripts/check-docs.mjs` until it prints `docs: no findings`. Do not commit unless the owner asks.

## Report at the end

What was filled in; what was left and why; the questions waiting for the owner; the commands that fail today;
and the first real task you would put through the cycle.
