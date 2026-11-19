# The development cycle: master guide

_How work moves through this repository, which documents it leaves behind, the format of each, and the rules for
changing them. People and Claude follow the same guide. `CLAUDE.md` holds the short rules every session needs;
this file holds everything else._

Based on Anthropic's [AI-native SDLC playbook](https://claude.com/resources/articles/the-ai-native-sdlc-playbook)
and a docs system that was run on a real product. When this guide and practice disagree, fix one of them in a
pull request; do not let them drift.

## Contents

1. [The idea](#1-the-idea)
2. [The cycle at a glance](#2-the-cycle-at-a-glance)
3. [Who does what](#3-who-does-what)
4. [Where everything lives](#4-where-everything-lives)
5. [Two paths: light and full](#5-two-paths-light-and-full)
6. [The stages](#6-the-stages)
7. [The documents: format and rules](#7-the-documents-format-and-rules)
8. [The learning loop](#8-the-learning-loop)
9. [Enforcement: skills, hooks, checks](#9-enforcement-skills-hooks-checks)
10. [Git rules](#10-git-rules)
11. [Measuring the cycle](#11-measuring-the-cycle)
12. [Adopting it in a new project](#12-adopting-it-in-a-new-project)
13. [Changing this guide](#13-changing-this-guide)

## 1. The idea

Code is no longer the slow part. The slow parts are deciding what to build, checking that it works, and
remembering what was learned. So the cycle is built on five ideas:

- **Every stage ends in a committed document, and the next stage starts by reading it.** Nothing important lives
  only in a chat. The chain of commits is the audit trail: who asked, what was produced, who approved.
- **People spend their attention at gates, not on keystrokes.** Claude drafts; a person accepts, corrects or
  rejects. An agent never approves its own work.
- **Claude checks its own work before a person sees it.** Tests, a build, a hands-on run. Output is shown, not
  described.
- **It is a loop.** What production, a test run or a session teaches comes back as a rule, a check or a new
  intent.
- **Advice is backed by a check.** A skill or a line in `CLAUDE.md` is advice. Anything that must always hold
  gets a hook or a script behind it.

## 2. The cycle at a glance

```
            ┌──────────────────────────────────────────────────────────────────┐
            │                                                                  │
            ▼                                                                  │
  1 PLAN ──────► 2 DESIGN ──────► 3 BUILD ──────► 4 TEST ──────► 5 DEPLOY ──────► 6 MAINTAIN
  triage line     spec.md          plan.md         run logs       pull request     lessons.md
  intent.md       (review.md)      code + tests    evidence in    review findings  new triage line
                                   build.md        build.md       release          new rule / check
     gate            gate            gate            gate            gate             gate
   owner accepts   owner accepts   engineer agrees  checks pass    code owner       owner triages
   the intent      the spec        the plan         and are shown  approves, merges the finding
```

| Stage | Question it answers | Document it ends with | Gate (who approves) |
|---|---|---|---|
| 1. Plan | What is the problem and is it worth doing? | A line in `docs/triage.md`; `intent.md` | Owner accepts or rejects the intent |
| 2. Design | What exactly will the product do? | `spec.md` (and `review.md` when today's behaviour must be described first) | Owner accepts the spec |
| 3. Build | How will it be built, and what was built? | `plan.md`, the diff and its tests, `build.md` | Engineer agrees the plan before any edit |
| 4. Test | Does it work, and how do we know? | Evidence in `build.md`; a run log in `docs/runs/` | The checks pass and their output is shown |
| 5. Deploy | Is it safe to merge and release? | The pull request with review findings; the release | Code owner approves; release needs a named person |
| 6. Maintain | What did real use teach? | An entry in `docs/lessons.md`; a rule; a check; a new triage line | Owner triages: fix now, schedule, dismiss |

## 3. Who does what

Roles, not people. On a small team one person holds several; the rule that survives is that **whoever wrote a
thing does not approve it**.

| Role | Does | Approves |
|---|---|---|
| **Owner** | Says what matters, answers product questions, decides scope | Intent, spec, releases, lessons |
| **Engineer** | Steers Claude, reads plans and diffs, owns the code | Plans, pull requests (as code owner) |
| **Claude** | Drafts every document, writes code and tests, runs checks, reviews pull requests, keeps the docs in step | Nothing. Claude's review findings inform; they never approve or block on their own |

How an approval is recorded: the document's `**Status:**` line changes, with the role and date, in a commit made
by (or at the word of) the approver. On a team with branch protection, the merge of the pull request is the
record.

## 4. Where everything lives

```
CLAUDE.md                     the rules every session follows (short)
SDLC-GUIDE.md                 this guide
REVIEW.md                     how pull requests are reviewed
.claude/settings.json         hooks
.claude/skills/               one skill per step of the cycle
.claude/agents/               verifier and reviewer: fresh-context checks
scripts/check-docs.mjs        checks that the docs agree with each other and with git
evals/                        replayable tasks that test the agent setup (optional, see 6.4)
docs/
  README.md                   index: every change, open questions, later work
  triage.md                   every incoming task, one line each
  handover.md                 open branches and the latest five sessions
  handover-archive.md         older handover entries
  lessons.md                  what real use taught, and the rule from each
  system-map.md               profile, parts, data, how it runs, is tested and deploys
  testing.md                  how hands-on checks are done
  changes/
    NNN-short-name/           one folder per change
      intent.md               the problem and the outcome wanted        (full path)
      review.md               what is true today                        (optional)
      spec.md                 what the product will do                  (full path)
      plan.md                 how it will be built                      (full path)
      build.md                what was built and how it was checked     (always)
  system-review/
    NN-module.md              how each module behaves: the source of truth
    checklists/NN-module.md   hands-on test scripts
  runs/
    YYYY-MM-DD-name.md        one log per checklist run
  reference/                  longer background: architecture, data model, API summary
```

**One source of truth per fact.** How a module behaves is in its system review, nowhere else. Other documents
link to it. If the team keeps a tracker (Jira, Linear, GitHub Issues) as the system of record for tasks, say so in
`CLAUDE.md`, put the tracker's ID in the triage line, and put the change folder's path in the ticket.

## 5. Two paths: light and full

Every task gets a triage line first. The line names its path.

| | **Light** | **Full** |
|---|---|---|
| Use when | The product should already behave this way: a bug, a typo, a refactor with no visible change, a dependency bump | The change alters what the product does, adds or removes data, touches money, sign-in, permissions or personal data, or cannot be undone with a revert |
| Documents | triage line → `build.md` | triage line → `intent.md` → (`review.md`) → `spec.md` → `plan.md` → `build.md` |
| Gates | Engineer agrees the approach in chat; pull request review | Every gate in section 2 |

When unsure, take the full path. A light task that turns out to change behaviour stops and moves to the full path:
change the triage line's Path and write the intent.

Small full changes may put intent and spec in one sitting, but they stay two files with two approvals: the intent
says *why* and the spec says *what*, and they are wrong in different ways.

## 6. The stages

Each stage lists what goes in, the steps, what comes out, the gate, and the skill that runs it. The skills are in
`.claude/skills/`; each can also be done by hand by following the steps.

### 6.1 Plan (`/intake`)

**In:** an idea, a bug report, a request, a failed checklist row, a production incident.

1. Add a line to `docs/triage.md` **before any work**, with the next `TR-nnn` ID.
2. Look at the code or reproduce it, and fill in Verdict, Why (with file and line) and Path.
3. Light path: stop here; go to Build.
4. Full path: create `docs/changes/NNN-short-name/` and talk the problem through until it is concrete. Claude
   asks questions; the originator answers. Then Claude writes `intent.md` from the template.
5. The owner reads it, corrects it and sets `**Status:** Accepted` (or `Rejected`, with the reason; the triage
   line is then `closed (rejected)`).

**Out:** triage line; accepted `intent.md`. **Gate:** owner.

### 6.2 Design (`/spec`)

**In:** an accepted `intent.md`.

1. Read the intent, the system review of every module it touches, and `docs/lessons.md`.
2. If today's behaviour is unclear or disputed, write `review.md` first: what the product does now, with
   evidence, and the problems found.
3. Write `spec.md`: what will change, what will not, every rule and edge case, and acceptance criteria a test can
   check. Flag anything that contradicts a rule, a policy or another module under "Concerns".
4. Questions for the owner go in the spec and in the index (`docs/README.md`, "Questions"). Do not guess a
   product decision; ask, or record the assumption as an assumption.
5. The owner answers the questions, resolves the concerns and sets `**Status:** Accepted`.
6. Add the change to "Planned changes" in each affected system review.

**Out:** accepted `spec.md`. **Gate:** owner (and whoever owns a policy the spec touches).

### 6.3 Build (`/plan-change`, then `/build-note`)

**In:** an accepted `spec.md` (full), or a triage line (light).

1. **Plan before editing.** Start in plan mode. Claude reads the code without changing it and writes `plan.md`:
   files that change, order of work, risks, proof. Ask it: what could break, which step is riskiest, what was
   rejected and why. The plan is ready when someone else could build from it alone.
2. The engineer sets `**Status:** Agreed`. Only then does any file change.
3. Cut a branch (section 10) and add a line under "In progress" in `docs/handover.md`.
4. Build in the plan's order. For a bug: write the failing test first, see it fail for the right reason, then
   fix the code without touching the test.
5. When the build departs from the plan, update `plan.md` ("Decided while building") **in the same commit**. If
   it departs from the spec, stop and ask the owner; an accepted spec changes only with the owner's word.
6. Write `build.md` and update the system review of each module touched, in the same pull request.

**Out:** `plan.md`, the diff with tests, `build.md`, updated system review. **Gate:** engineer agrees the plan.

**Working in parallel.** Split work by files, one git worktree per task, and start with two or three sessions; add
more only while review keeps up. Two sessions never write the same files.

**More autonomy.** Auto-accepting edits is for routine work only: a tight spec or plan, a small blast radius,
and tests that cover it. It is earned by the guardrails (a tuned `CLAUDE.md`, hooks, a test command that works),
not assumed.

### 6.4 Test

**In:** the diff.

1. **One command per check.** Type check, lint, unit tests, end-to-end tests: each is one command that exits
   non-zero on failure, listed in `CLAUDE.md`.
2. **Targets are stated up front** in the spec's acceptance criteria and the plan's "Proof": tests pass, the
   endpoint answers 200 with the new field, the screen matches the mock.
3. **Claude runs the checks and shows the output** before saying it is done. "Fix the code, not the test."
4. **Hands-on run.** Walk the changed journey in the real product as `docs/testing.md` describes: the journey,
   the way back (delete, cancel, undo, sign out), ordinary data and awkward data (long names, accents, empty
   lists). Use the module's checklist; add rows for new behaviour. Log the run in `docs/runs/`.
5. **Say what was not checked.** Every `build.md` has a "Not checked" section. An empty one is a claim.
6. A failed row that is not already a known problem gets a triage line.

**Out:** evidence in `build.md`; run log. **Gate:** all checks pass with output shown; nothing skipped silently.

**Evals (optional, later).** Once the agent setup matters (several people, many rules), keep 20 to 50 real past
tasks in `evals/`, each a prompt plus checks, and replay them when `CLAUDE.md`, a skill or a hook changes. Every
production incident becomes an eval. Format: `evals/README.md`.

### 6.5 Deploy

**In:** a branch whose checks pass.

1. Run `node scripts/check-docs.mjs`. The pre-push hook runs it too and blocks on errors.
2. Open a pull request (section 10). Its body links the triage line and the change folder.
3. **Review in three passes**, as `REVIEW.md` says: bugs and logic; security; agreement with `spec.md`,
   `plan.md` and the system review. Claude may run the review; a person approves. The author never approves.
4. A mistake that review catches for the second time becomes a rule in `CLAUDE.md` (section 8).
5. Merge only when the owner or code owner says so. Nothing is pushed to the main branch directly.
6. **Release** as `docs/system-map.md`, "How it deploys" says. Production needs a named person's go-ahead, every
   time; Claude prepares the release and stops at that gate. Know the way back before going forward: each
   `build.md` has a "Way back", and the rollback is practised, not assumed.
7. **After the merge**, in the next commit on any branch: set the triage State to `merged (PR n)`, add the pull
   request number and merge commit to `build.md`, set the plan's status to `Merged`, remove the branch from "In
   progress" in the handover, move the change in the index.

**Out:** merged pull request with its findings; release. **Gate:** code owner; named person for production.

### 6.6 Maintain (`/lesson`, `/handover`)

**In:** production, users, monitoring, a scheduled scan, the end of a session.

1. **An incident** gets a triage line, then the real error first (the log line, the database's own reason). Do
   not fix a guess.
2. When the fix ships, write the entry in `docs/lessons.md`, add its rule to `CLAUDE.md`, and add the check that
   would have caught it: a test, a checklist row, an eval or a hook.
3. **A finding too big for a fix** becomes an `intent.md` and starts at Plan. The loop closes here.
4. **At the end of every session**, write the handover entry, ending with "Slowed down by". Anything likely to
   slow the next session becomes a rule in the same commit.
5. **Later, when there is something to watch:** a deterministic script reads one metric against its usual range
   and, on a breach, invokes Claude read-only to diagnose and write an intent for the triage queue. Claude never
   holds production credentials and acts only through the same gates as everyone else.

**Out:** lesson, rule, check, new triage line. **Gate:** owner triages.

## 7. The documents: format and rules

Templates are in the repository at the paths given. Copy the template; keep its headings and their order (the
check script and the next reader both rely on them). A heading with nothing to say keeps the heading and says
"None".

Rules that hold for every document:

- **Plain words, short lines.** Write for a reader who was not in the room.
- **Evidence over adjectives.** File and line, the command and its output, the text seen on screen.
- **People by role.** Names, emails and personal data of real users stay out of the docs. Secrets never go in.
- **Dates are `YYYY-MM-DD`.** IDs are never reused and never renumbered.
- **Status lines** have the form `**Status:** Value (role, date)` in the first lines of the file.
- **History is git's job.** Edit a draft freely. Once a document is accepted, change it only as its rules below
  say, so a reader can trust what was approved.

### 7.1 `docs/triage.md`: the triage log

One line per incoming task, newest first.

| Column | Holds |
|---|---|
| ID | `TR-nnn`, the next number |
| Date | The day it came in |
| Source | Chat, ticket and its ID, run log row, store review, monitoring |
| Raised by | Role |
| In short | One sentence, as the person would say it |
| Module | The system review it belongs to |
| Verdict | `bug`, `change`, `question`, `not a bug`, `duplicate` |
| Why | What the code or a run shows, with file and line |
| Path | `light` or `full` (`—` when no work follows) |
| Change | Link to the change folder, once there is one |
| State | `open`, `building`, `built (branch)`, `merged (PR n)`, `closed (reason)` |

Rules:
- Written **before** any work on the task. Anyone may add a line.
- Rows are never deleted or reordered. Only Verdict, Why, Path, Change and State change after the first write.
- `duplicate` names the ID it duplicates. `closed` always carries a reason.
- Several triage lines may point at one change folder; a change folder always has at least one triage line.

### 7.2 `intent.md`: the problem and the outcome wanted

Template: `docs/changes/_template/intent.md`. Sections: **Problem**, **Proposed outcome**, **Affected users and
systems**, **Constraints**, **Open questions**.

- Status: `Draft` → `Accepted` | `Rejected`; later `Superseded` (by which change).
- Written by Claude with the originator; accepted by the owner.
- Says *why* and *for whom*. No solution design, no file names.
- After `Accepted`: do not rewrite. A change of mind is a dated line under "Revisions" at the end, with who
  decided. If the problem itself changed, mark it `Superseded` and write a new one.
- An intent is ready when a stranger could say what success looks like and how they would notice it.

### 7.3 `review.md`: what is true today (optional)

Template: `docs/changes/_template/review.md`. Sections: **What was looked at**, **What it does today**,
**Problems found**, **Proposals**.

- Written when the spec cannot be written without first agreeing on current behaviour, or when the owner must
  choose between proposals.
- Facts carry the marks from 7.7. It records a moment: never updated after the spec is accepted.

### 7.4 `spec.md`: what the product will do

Template: `docs/changes/_template/spec.md`. Sections: **Summary**, **What will change**, **What will not
change**, **Rules and edge cases**, **Acceptance criteria**, **Concerns**, **Questions for the owner**.

- Status: `Draft` → `Accepted`; later `Superseded`.
- Written by Claude; accepted by the owner. Describes behaviour as a user or a caller sees it. How to build it
  belongs in the plan.
- Acceptance criteria are numbered (`AC-1`…) and each can be checked by a test or a checklist row.
- "What will not change" is required. It is where scope is kept from growing.
- A question is closed by writing the answer under it, with role and date. No open question may remain when the
  status becomes `Accepted`.
- After `Accepted`: changes need the owner's word, are made in the same commit as the plan or code that needs
  them, and are listed under "Revisions" at the end.

### 7.5 `plan.md`: how it will be built

Template: `docs/changes/_template/plan.md`. Sections: **Files that change**, **Order of work**, **Risks**,
**Proof**, **Rejected alternatives**, **Decided while building**.

- Status: `Draft` → `Agreed` → `Building` → `Built` → `Merged`; or `Dropped` (with the reason).
- Written by Claude in plan mode; agreed by the engineer (a tech lead for anything risky: data migrations,
  sign-in, money, deletion).
- "Proof" maps each acceptance criterion to the test or checklist row that will show it.
- No file changes before `Agreed`.
- While building, the plan follows reality: a departure is written under "Decided while building" in the same
  commit as the code. A plan that no longer matches the diff is a defect.
- Frozen after `Merged`.

### 7.6 `build.md`: what was built and how it was checked

Template: `docs/changes/_template/build.md`. Sections: **Problem**, **Cause**, **Change**, **How it was
checked**, **Found while building**, **Not checked**, **Way back**.

- Required for every change, light or full, in the same pull request as the code.
- First lines: branch, base, then the pull request number and merge commit once merged.
- "Cause" for a bug has file and line. For a feature it says what was missing.
- "How it was checked" lists commands with their results (counts, not "passed"), the journey walked with what was
  seen, the way back, awkward data, and each platform. Test data created is removed, and the note says so.
- "Not checked" is honest and specific. "Way back" says how to undo it: revert, migration down, rollback.
- After merge: only the pull request number and merge commit are added. A later discovery gets a new triage line
  and links back.

### 7.7 `docs/system-review/NN-module.md`: how a module behaves

Template: `docs/system-review/_template.md`. Sections: **Planned changes**, **What it is for**, **Who uses it,
and where**, **How it works**, **Rules it enforces**, **Problems found**, **Questions**, **How to test it**,
**Not yet checked**, then dated **Update** sections, newest last.

This is the source of truth for behaviour. Every statement carries one mark:

| Mark | Means |
|---|---|
| **[confirmed]** | Intended behaviour, said by the owner or the team |
| **[observed]** | Seen in the running product or a real request; not yet confirmed as intended |
| **[tested]** | Held by an automated test (name it) |
| **[code]** | Read in the code, not run |
| **[question]** | Looks wrong, or two parts disagree; also listed under "Questions" and in the index |

Rules:
- Read the module's review before changing the module. Update it in the same pull request as the change.
- A change adds a dated "Update" section (change number, triage ID, link to `build.md`). When updates pile up or
  contradict the body, fold them into the body and delete them, in a pull request of their own.
- A mark only goes up with evidence: `[code]` becomes `[observed]` when someone saw it, `[confirmed]` when the
  owner said so.
- "Problems found" rows are numbered and never renumbered; a fixed problem keeps its row with the fix linked.
- When a question is answered: write the answer into the review, re-mark the statement, remove it from the index.
- Modules are numbered `01`…; `docs/system-review/README.md` lists them with the code each covers.

### 7.8 `docs/system-review/checklists/NN-module.md`: hands-on test scripts

Template: `docs/system-review/checklists/_template.md`. Starts with **Build and data**, **Settings to put back**
and **Clean-up**, then a table: **ID**, **Who**, **Do**, **Expect**, **Review**.

- One per module, named like its review, plus `00-smoke.md`: a quick pass over the whole product.
- IDs are a letter for the checklist and a number (`S-01`). They never change and are never reused; new rows go
  at the end.
- "Expect" is concrete enough that two runs reach the same verdict. "Looks fine" is not an expectation.
- "Review" names the statement in the system review that the row checks. A row with nothing to point at means
  the review needs a line.
- No row is skipped. What Claude cannot do moves to a **YOU** table with what the owner must do.
- New behaviour adds rows in the same pull request. A removed feature strikes its rows through; it does not
  delete them.

### 7.9 `docs/runs/YYYY-MM-DD-name.md`: run logs

Template: `docs/runs/_template.md`. Header (build, device or browser, backend, accounts), a table of **ID**,
**Result**, **Note**, then **Put back** and **Follow-up**.

- One file per run. Results are `pass`, `fail`, `blocked`, `not checked` or `YOU`.
- A `fail` gets a triage line unless the review already lists it as a known problem.
- Never edited after the run, except to add the triage IDs it led to. A re-run is a new file.
- Screenshots that show personal data stay out of the repository.

### 7.10 `docs/lessons.md`: what real use taught

Each entry: `## L-nnn: title (date)`, then **What happened** (as people saw it), **Why**, **Why nothing caught
it**, **The fix** (link to `build.md`), **The rule** (the exact line added to `CLAUDE.md`), **The check** (the
test, checklist row, eval or hook that now catches it).

- Written when a fix lands for something that reached real users or real data. Newest first.
- Append-only. An entry is never rewritten; a rule that stops applying is marked `(retired, date, why)` in the
  heading and its line is removed from `CLAUDE.md`.
- Every live lesson's ID appears in `CLAUDE.md`. The check script enforces this.

### 7.11 `docs/handover.md` and `docs/handover-archive.md`

Template: the file itself. An **In progress** section, then dated entries, newest first.

- **In progress:** one line per open branch: branch, triage ID, what is left. Added when the branch is cut,
  updated when the plan changes, removed after the merge.
- **An entry per session**, written at the end: what was done and where it is written, what is left for the
  owner, what is still running, what settings were changed and not put back, and **"Slowed down by:"**.
- The file keeps the latest five entries. Older ones move to the top of `handover-archive.md`, unchanged.
- The next session reads "In progress" and the top entry before anything else (the session-start hook prints
  them).

### 7.12 `docs/system-map.md`: the product on one page

Sections: **Profile**, **This machine**, **What only the owner can run**, **The parts**, **The data**,
**Integrations**, **How it runs locally**, **How it is tested**, **How it deploys** (with the rollback), **Risk
areas**, **What is missing**, **Questions**.

- Read before everything else by someone new. Corrected whenever it is found wrong, in whatever pull request
  found it.
- Commands are copied from a terminal that ran them, not written from memory.

### 7.13 `docs/testing.md`: how hands-on checks are done

Sections: **What it is**, **Tools**, **Set up once**, **Before each run**, **During the run**, **After the
run**, **Who does each row**, **Limits**.

- Changes when the tools or the setup change. Tool quirks that cost time go here, with a one-line pointer in
  `CLAUDE.md` only if they bite every session.

### 7.14 `docs/README.md`: the index

Sections: **How the pieces fit**, **Changes** (every change folder with its status), **System review** (modules
and their state), **Questions** (every open question, grouped, each pointing at its source), **Later work**
(agreed, not scheduled: `T-nnn`), **Runs**.

- A change folder gets its line when it is created. The check script fails if one is missing.
- An answered question is removed here and written into its source. A later-work item that is picked up gets a
  triage line and is struck through.

### 7.15 `CLAUDE.md`: the rules every session follows

Template: `CLAUDE.md`. Sections: **What this is**, **Commands**, **Conventions**, **The cycle**, **Done means**,
**Safety**, **Rules learned from production**, **Rules from bugs already found**, **Things Claude gets wrong**.

- Short. It is read at the start of every session, so every line costs attention. Day-one essentials only;
  detail lives in the docs it points to.
- **A rule is added** when Claude makes the same mistake twice, when a lesson lands, when review catches a
  pattern twice, or when a handover's "Slowed down by" is likely to repeat.
- Each rule is one or two lines, says what to do (not only what to avoid), and names its source: `(L-003)`,
  `(change 012)`.
- **A rule is removed** in the same pull request that makes it obsolete (a tool gets installed, a library
  changes). The file only holds rules that still bite.
- Reviewed like code. A rule that must never be broken also gets a hook (section 9).

### 7.16 `REVIEW.md`: how pull requests are reviewed

Template: `REVIEW.md`. Three passes, what counts as **Important** and as a **Nit**, a cap on nits, and a
do-not-report list.

- Owned by the engineer or tech lead. Tuned monthly: drop findings nobody acted on, add what review missed.

### 7.17 `evals/`: replayable tasks (optional)

One file per case: the prompt, the starting commit, and the checks. See `evals/README.md`.

## 8. The learning loop

Six places where the cycle learns. Each has a trigger, a place the lesson is written, and something that makes
it stick.

| Trigger | Written in | Made to stick by |
|---|---|---|
| Claude makes the same mistake twice | `CLAUDE.md`, "Things Claude gets wrong" | Read every session |
| Review catches a pattern twice | `CLAUDE.md` rule; `REVIEW.md` if reviewers should look for it | Review pass 3 |
| A bug is fixed | `build.md`; a rule under "Rules from bugs already found" if it could recur | A test written before the fix |
| Production shows a problem first | `docs/lessons.md` + rule under "Rules learned from production" | The check named in the lesson; `check-docs` ties lesson to rule |
| A session loses time | Handover, "Slowed down by" | A rule or a `docs/testing.md` line in the same commit |
| A checklist row fails | Triage line; "Problems found" in the system review | The row stays and is walked again |

Three habits keep the loop from clogging:

- **Promote, do not pile up.** A note becomes a rule; a rule that must never fail becomes a hook or a test. Each
  step up removes the need to remember.
- **Prune.** Rules are deleted when they stop applying. Updates are folded into their review. The handover keeps
  five entries.
- **Questions are tracked, not guessed.** An open product question lives in its source document and in the
  index until the owner answers it.

## 9. Enforcement: skills, hooks, checks

| Layer | What it is | Strength | In this repository |
|---|---|---|---|
| `CLAUDE.md` | Rules read every session | Advice | `CLAUDE.md` |
| Skills | Step-by-step instructions loaded when a step starts | Advice, consistent | `.claude/skills/`: `setup-cycle` (once), then `intake`, `spec`, `plan-change`, `build-note`, `lesson`, `handover` |
| Agents | Helpers with a fresh context and limited tools, so the author of a change is not its only judge | Advice, independent | `.claude/agents/`: `verifier` (runs the checks and walks the journey, reports without fixing), `reviewer` (the three passes of `REVIEW.md`, read-only) |
| Hooks | Scripts the harness runs; they can block | Deterministic | `.claude/settings.json`: session start prints the handover and findings; `git push` is blocked while the docs have errors |
| Docs check | `node scripts/check-docs.mjs` | Deterministic | Links, triage states, change folders against their triage lines, gates in order, the index, the handover, lessons against rules |
| CI and branch protection | Tests on every pull request; no direct push to main; code owner approval | Deterministic | Set up per project (section 12) |

Rules for the layers:

- **Fix the docs rather than skipping the hook.** When a check is wrong or no longer useful, change the script in
  a pull request like any other code.
- **Hooks are fast and narrow.** Formatting and protected paths at edit time; the full test suite at commit or
  pull request, not on every edit.
- **Blocks explain themselves**: what failed, and how to get past it properly.
- **Add a hook when a rule has been broken despite being written down.** Typical ones: block edits to generated
  or frozen paths; block edits to test files during a fix; keep credentials out of the diff; require a named
  go-ahead before a production deploy command.
- **A skill is written the third time a step is done by hand**, not before. Run a step by hand first.
- **An agent is added only for a job that needs a fresh context or narrower tools**: checking or reviewing work
  the main session wrote. A job the main session does just as well stays a skill. Agents report; they do not
  fix and do not approve.
- **Each agent names its model and effort** in the `model:` and `effort:` lines of its file. The model is an
  alias, so it follows the newest version; effort is `low`, `medium`, `high`, `xhigh` or `max`:

  | Agent | Model | Effort | Why |
  |---|---|---|---|
  | `verifier` | `sonnet` | `medium` | Mostly running commands and driving the product step by step: many tool calls, little deep reasoning. Fast and cheap matters more; enough thought to notice when what it sees does not match the spec |
  | `reviewer` | `opus` | `high` | Finding a subtle bug or a security hole in someone else's diff is the hardest reasoning in the cycle, and it runs once per pull request |

  Change `model:` to `inherit` to use whatever model the session is on. Raise the verifier (to `high`, then to
  `opus`) if it starts passing things that later fail. Raise the reviewer to `xhigh` for changes to money,
  sign-in, permissions or migrations; do not lower it to save cost.

## 10. Git rules

- Branches: `feature/…`, `fix/…`, `hotfix/…`, `chore/…`, cut from the integration branch. Commit messages follow
  Conventional Commits and name the triage ID: `fix(chat): keep the composer above the keyboard (TR-045)`.
- **Each gate is a commit**: the accepted intent, the accepted spec, the agreed plan. Then code, with `build.md`
  and the system-review update in the same pull request.
- Nothing reaches the main branch without a pull request. Do not commit or push unless the owner asks.
- Database changes are migrations in the same pull request as the code that needs them. After running one
  locally, query the database to check it did what it says.
- A pull request body has: what and why in two lines, the triage ID, a link to the change folder, how it was
  checked, what was not.

## 11. Measuring the cycle

Read from git and the docs once a month; no tooling needed. Watch the direction, not the number.

| Stage | Measure | Wanted |
|---|---|---|
| Plan | Days from triage line to accepted intent | Hours, not weeks |
| Plan | Intents revised after their spec was accepted | Falling |
| Design | Spec revisions after the plan was agreed | Falling |
| Build | Changes merged without a rework round in review | Rising |
| Build | Mistakes `CLAUDE.md` should have prevented | Falling |
| Test | First-run pass rate of the checks on Claude's changes | Rising |
| Deploy | Problems found in review against problems found after release | More before, fewer after |
| Maintain | Repeat incidents of a class that already has a lesson | Zero |

## 12. Adopting it in a new project

Day one, the short way: copy the **contents** of the starter folder (not the folder itself) into the repository
root, open a Claude Code session there, and run `/setup-cycle` (or say "set up the cycle"). The skill does steps
2 to 5 below from the real code, asks the owner what the code cannot tell it, and reports what it could not fill
in. Until it has run, the docs check warns at every session start that the templates are unfilled.

Day one, by hand:

1. Copy the starter's contents into the repository root: `CLAUDE.md`, `SDLC-GUIDE.md`, `REVIEW.md`, `.claude/`,
   `scripts/`, `docs/`, `evals/`. Merge by hand with any file that already exists.
2. Fill in `CLAUDE.md`: the commands (run each one first), the conventions, the safety rules. Delete what does
   not apply. Run `/init` in Claude Code if the repository has code already and merge what it finds.
3. Fill in `docs/system-map.md` from the code. Mark what was not run as `[code]`.
4. Split the product into modules and write a system review for each from the code, all marked `[code]`. Write
   `00-smoke.md` and run it once.
5. Run `node scripts/check-docs.mjs` until it is clean. Commit.
6. Put the first real task through the cycle by hand, without skills, to see where the guide does not fit. Fix
   the guide.

Then, in this order, as each earns its keep:

| Level | Add | When |
|---|---|---|
| 1 | The documents and gates, prompted by hand | Day one |
| 2 | The skills and the two hooks | After two or three changes by hand |
| 3 | CI on pull requests, branch protection, Claude reviewing pull requests with `REVIEW.md` | When there is a second contributor, or a production |
| 4 | Project-specific hooks (protected paths, the production gate), parallel worktrees | When a written rule gets broken; when review keeps up |
| 5 | Evals; scheduled scans; monitoring that writes intents | When the agent setup or production is big enough to regress unnoticed |

## 13. Changing this guide

- This guide changes by pull request, like code, with a triage line saying why.
- When a format changes, change the template, the skill and `scripts/check-docs.mjs` in the same pull request.
  Existing documents are not rewritten; the new format applies from that day.
- A step nobody follows is either enforced (section 9) or deleted. Do not keep rules that are only wishes.
