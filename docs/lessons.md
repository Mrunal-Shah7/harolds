# Lessons

_What reached real users or real data, why, and the rule that came from it. Newest first. Each lesson has a
matching line in `CLAUDE.md` under "Rules learned from production", ending with its ID, and a check that now
catches it. Append-only: a rule that stops applying is marked `(retired, date, why)` in its heading and removed
from `CLAUDE.md`._

None yet. Bugs found before release (by a test, a run or a review) put their rule in `CLAUDE.md` under "Rules
from bugs already found" instead.

<!--
Entry format.

## L-001: short title (YYYY-MM-DD)

- **What happened:** as people saw it, with dates and how many were affected. No names.
- **Why:** the cause, with file and line, and the real error (log line, database message).
- **Why nothing caught it:** the test, review step or check that was missing or looked the wrong way.
- **The fix:** link to the change's build.md; the triage ID.
- **The rule:** the exact line added to CLAUDE.md.
- **The check:** the test, checklist row, eval or hook that now catches it.
-->
