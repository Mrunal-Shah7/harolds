# Checklists

Hands-on test scripts, one per module (named like its review), plus `00-smoke.md` for a quick pass over the whole
product. They are run as [../../testing.md](../../testing.md) describes; each run is logged in
[../../runs/](../../runs/README.md). Template: [_template.md](_template.md).

## Format

Each checklist starts with:

- **Build and data**: which build, which test accounts, which seeded data, what must be true before starting.
- **Settings to put back**: everything the run changes and must restore.
- **Clean-up**: what the run creates and how it is removed and checked as gone.

Then a table of rows:

| ID | Who | Do | Expect | Review |
|---|---|---|---|---|
| X-01 | P | One action, with the exact screen and control | What must be seen (text, count, state) | The review statement or problem number it checks |

- **ID**: a letter for the checklist (`S` smoke…) and a number. IDs never change and are never reused; new rows
  go at the end.
- **Who**: P, A, D or YOU (see the testing guide).
- **Expect**: concrete enough that two runs reach the same verdict. "Looks fine" is not an expectation.
- **Review**: the statement in the system review the row checks. A row that checks something the review does not
  say yet means the review needs a line.

**No row may be skipped.** What Claude cannot do moves to a YOU table at the end with what the owner needs to do,
and stays listed until done.
