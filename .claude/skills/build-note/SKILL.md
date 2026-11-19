---
name: build-note
description: Finish a change - run the checks, walk the journey, write build.md, update the system review, checklist and triage line, and run the docs check. Use when the code for a fix or feature is written, before opening a pull request, or when the user says "write the build note", "wrap up this change".
---

# Build note: what was built and how it was checked

Formats and rules: `SDLC-GUIDE.md`, sections 6.3 to 6.5 and 7.6 to 7.9.

1. Run every check in `CLAUDE.md`, "Commands", for each app the diff touches. Keep the output; fix the code, not
   the test.
2. Walk the changed journey in the running product as `docs/testing.md` says: the journey, the way back, ordinary
   and awkward data. Use the module's checklist; add rows for new behaviour. Remove test data and check it is
   gone.
   For a full-path change, or any change you are not sure of, also run the `verifier` agent on the change folder
   and branch: it re-checks with a fresh context and reports without fixing. Fix what it finds and put its
   remaining "Not checked" items into `build.md`.
3. If a checklist was walked, write the run log in `docs/runs/` (template there) and add its line to the index.
4. Write `build.md` in the change folder from `docs/changes/_template/build.md`. A light change has no folder
   yet: create `docs/changes/NNN-short-name/`, link it from the triage row and add it to the index.
   - Results as counts and things seen, not "passed" or "works".
   - "Not checked" is specific and honest.
   - "Way back" says how to undo it.
5. Update the system review of each module touched: a dated "Update" section, marks raised only with evidence,
   "Planned changes" and "Problems found" brought up to date.
6. Set the triage state to `built (branch)` and the plan to `Built`. Open triage lines for anything found and not
   fixed.
7. If the same mistake was made twice in this change, add the rule to `CLAUDE.md` with its source.
8. Run `node scripts/check-docs.mjs` until clean.
9. Before a pull request, run the `reviewer` agent on the branch and its base. Fix every Important finding or
   say in the pull request body why not. Its findings do not replace the code owner's approval.

Do not commit or push unless asked.

After the merge, in the next commit: triage `merged (PR n)`, the pull request number and merge commit in
`build.md`, the plan `Merged (PR n)`, the branch removed from "In progress", the index updated.
