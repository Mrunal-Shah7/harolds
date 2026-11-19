---
name: intake
description: Record an incoming task (bug report, request, idea, incident, failed checklist row) in docs/triage.md, decide its path, and for the full path write intent.md. Use before any work starts on something new, or when the user says "triage this", "new task", "log this bug", "write an intent".
---

# Intake: triage line, then intent

Formats and rules: `SDLC-GUIDE.md`, sections 5, 6.1, 7.1 and 7.2. Do not change any code in this step.

1. Read `docs/triage.md`. If the task is already there, say which line and stop (or mark the new one `duplicate`).
2. Look before judging: read the code involved, or reproduce the problem. Read the module's system review.
3. Add a row at the top of the table with the next `TR-nnn`: date, source, role that raised it, one sentence in
   their words, module, verdict, **Why** with file and line, path, state `open`.
   - **light**: the product should already behave this way.
   - **full**: it changes what the product does, adds or removes data, touches money, sign-in, permissions or
     personal data, or cannot be undone with a revert. When unsure: full.
4. Light path: tell the user the verdict and the fix you propose, and stop.
5. Full path:
   1. Ask the user what you need to make the problem concrete: who is affected, what success looks like, what
      must not change. Ask; do not guess.
   2. Create `docs/changes/NNN-short-name/` (next number) and write `intent.md` from
      `docs/changes/_template/intent.md`. Why and for whom; no solution design.
   3. Link the folder in the triage row's Change column and add the change to `docs/README.md`, "Changes".
   4. Show the intent and ask the owner to accept, correct or reject it. Only on their word set
      `**Status:** Accepted (owner, date)`, or `Rejected` with the reason and the triage state
      `closed (rejected)`.
6. Run `node scripts/check-docs.mjs`.
