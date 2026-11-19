---
name: lesson
description: Record a production incident's lesson in docs/lessons.md, add its rule to CLAUDE.md and name the check that now catches it. Use when a fix has shipped for something that reached real users or real data, or the user says "write the lesson", "post-mortem".
---

# Lesson: what real use taught

Formats and rules: `SDLC-GUIDE.md`, sections 6.6, 7.10 and 8.

1. Get the real error first: the log line, the database's own reason, the request that failed. If it is not
   known, say so; do not write a lesson from a guess.
2. Add an entry at the top of `docs/lessons.md` with the next `L-nnn`: what happened as people saw it (no names),
   why, why nothing caught it, the fix (link to `build.md`), the rule, the check.
3. Add the rule to `CLAUDE.md`, "Rules learned from production": one or two lines saying what to do, ending with
   `(L-nnn)`.
4. Make the check real in the same pull request: a test, a checklist row, an eval case or a hook. A rule with no
   check behind it is only advice; say so if that is all there is.
5. If the incident shows a wider problem than the fix covered, open a triage line for it (path: full).
6. Run `node scripts/check-docs.mjs`.
