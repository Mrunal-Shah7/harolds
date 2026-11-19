---
name: handover
description: Write the end-of-session entry in docs/handover.md (done, left for the owner, next, still running, settings to put back, slowed down by), keep "In progress" current and archive old entries. Use at the end of a working session, before context runs out, or when the user says "write the handover", "wrap up for today".
---

# Handover: where the work stopped

Format and rules: `SDLC-GUIDE.md`, section 7.11.

1. Check what is true rather than remembering it: `git status`, `git branch`, running servers and background
   tasks, settings changed on a device or account.
2. Bring "In progress" up to date: one line per open branch with its triage ID and what is left; remove merged
   branches.
3. Add an entry above the newest one, using the format in the comment at the end of `docs/handover.md`. Keep it
   short: what was done and where it is written, not the story.
4. End with **Slowed down by:**. For each item likely to happen again, add the rule now (`CLAUDE.md`, or
   `docs/testing.md` for a tool quirk) and say in the entry where it went.
5. If the file now has more than five entries, move the oldest to the top of `docs/handover-archive.md`,
   unchanged.
6. Run `node scripts/check-docs.mjs`.
