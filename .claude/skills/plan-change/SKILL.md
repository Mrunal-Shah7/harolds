---
name: plan-change
description: Write plan.md for a change from its accepted spec.md (files, order of work, risks, proof), get it agreed, then cut the branch and record it in the handover. Use when a spec has been accepted, or the user says "plan this change", "write the plan".
---

# Plan: how it will be built

Formats and rules: `SDLC-GUIDE.md`, sections 6.3 and 7.5. Work in plan mode: read, do not edit code, until the
plan is agreed.

1. Check `spec.md` says `**Status:** Accepted`. If not, stop and say so.
2. Read the spec, the code it touches, the tests around it, and the module's system review and checklist.
3. Write `plan.md` from `docs/changes/_template/plan.md`:
   - every file that changes, and any migration;
   - an order of work in which each step leaves the checks passing;
   - risks: what could break, how it would be noticed, which step is riskiest;
   - proof: each acceptance criterion mapped to a test or checklist row, plus the hands-on journey and its way
     back;
   - alternatives rejected, and why.
4. Show it. Say plainly what you are least sure of. Change it until the engineer agrees, then set
   `**Status:** Agreed (engineer, date)`.
5. Only now: cut the branch named in the plan, add its line under "In progress" in `docs/handover.md`, set the
   triage state to `building` and the plan to `Building`.
6. Build in the plan's order. A departure from the plan goes under "Decided while building" in the same commit
   as the code. A departure from the spec: stop and ask the owner.
