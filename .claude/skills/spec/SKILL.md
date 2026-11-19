---
name: spec
description: Turn an accepted intent.md into spec.md (what the product will do, acceptance criteria, concerns, questions for the owner), writing review.md first when current behaviour is unclear. Use when an intent has been accepted, or the user says "write the spec", "spec this change".
---

# Spec: what the product will do

Formats and rules: `SDLC-GUIDE.md`, sections 6.2, 7.3 and 7.4. Do not change any code in this step.

1. Check `intent.md` in the change folder says `**Status:** Accepted`. If not, stop and say so.
2. Read: the intent; the system review of every module it touches; `docs/lessons.md`; the rules in `CLAUDE.md`;
   the code paths involved.
3. If today's behaviour is unclear or disputed, or the owner must choose between approaches, write `review.md`
   first from the template and show it.
4. Write `spec.md` from `docs/changes/_template/spec.md`:
   - behaviour as a user or caller sees it: exact words, status codes, fields;
   - "What will not change" is required;
   - edge cases: empty, very long, accented, duplicate, simultaneous, signed out, existing data;
   - numbered acceptance criteria, each checkable by a test or a checklist row;
   - under "Concerns", anything that contradicts a rule, a lesson, a policy or another module.
5. Every product decision you could not find an answer to goes under "Questions for the owner" and in
   `docs/README.md`, "Questions". Never settle one silently.
6. Show the spec with the questions and concerns first. When the owner has answered every question, write each
   answer under its question (role, date), remove them from the index, and only on the owner's word set
   `**Status:** Accepted (owner, date)`.
7. Add the change to "Planned changes" in each affected system review.
8. Run `node scripts/check-docs.mjs`.
