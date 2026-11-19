# Evals

_Optional; see SDLC-GUIDE.md, 6.4. Real past tasks replayed to check that a change to the agent setup
(`CLAUDE.md`, a skill, a hook, a new model) did not make Claude worse at this repository's work._

Start when the setup is big enough to regress unnoticed. Aim for 20 to 50 cases; begin with five.

## A case

One file per case in `cases/`, named `NNN-short-name.md`:

```
# NNN: <title>

- **From:** change NNN / TR-nnn / lesson L-nnn
- **Start at:** <commit to check out before running>
- **Allowed tools:** <for example: Read, Edit, Bash(npm test)>

## Prompt

<The task exactly as it was first given. No hints from the fix.>

## Checks

- [ ] `<test command>` passes
- [ ] `<lint command>` is clean
- [ ] <behaviour that must be unchanged, as a command or a test>
- [ ] <rule from CLAUDE.md that must be followed, and how to see it>
```

## Rules

- Every production incident becomes a case when its fix ships, owned by whoever owned the incident.
- A case uses only checks a script can decide. No "looks right".
- Run the cases on a schedule and whenever `CLAUDE.md` or `.claude/**` changes; keep the pass rate with the date in
  this file. A setup change that lowers it is not merged until the cause is understood.
- Retire a case that every model passes every time; add harder ones.

## Results

| Date | Setup change | Passed |
|---|---|---|
| — | | |
