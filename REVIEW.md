# How pull requests are reviewed

_For Claude and for people. Findings inform the code owner; they never approve or block on their own. The author
of a change does not approve it. Tuned monthly (see the end)._

## Before reading the diff

Read the pull request body, the triage line, and the change folder it links (`intent.md`, `spec.md`, `plan.md`,
`build.md`). A pull request with no triage line or no `build.md` is reported as Important and reviewed anyway.

## Three passes

1. **Bugs and logic.** Wrong results, unhandled failures, races, off-by-one, missing await, state that can go
   stale, behaviour on empty, very long or malformed input. Tests that cannot fail, and fixes with no test.
2. **Security and data.** Who can call this and with whose data; input that reaches a query, a path, a shell or
   HTML; secrets or personal data in code, logs or third-party requests; migrations that lose data or cannot be
   undone.
3. **Agreement with the documents.**
   - Does the diff do what `spec.md` says, all of it and nothing more? Name each acceptance criterion not met.
   - Does it match `plan.md`? A departure not written under "Decided while building" is a finding.
   - Does `build.md` describe this diff, and is "How it was checked" believable for it?
   - Is the system review of each touched module updated?
   - Does it break a rule in `CLAUDE.md`? A rule broken for the second time: say so, the rule needs a hook.
   - Is something here a lesson `CLAUDE.md` should have and does not?

## Severity

- **Important:** would cause wrong behaviour, data loss, a security or privacy problem, a failed release, or a
  spec criterion not met. Each one says what happens, where (file and line), and how to see it.
- **Nit:** style, naming, a simpler way to write it. At most **five** per review; leave the rest out.

End with a tally: `Important: n, Nit: n`, and one line on what was not reviewed.

## Do not report

- Anything the formatter, linter or type checker already enforces.
- Generated files, lock files, snapshots: `pnpm-lock.yaml`, `packages/db/src/generated/` (Prisma client),
  `apps/web/next-env.d.ts`, `*.tsbuildinfo`, `.next/`, `packages/mock-api/fixtures/*.json` (from
  `db:export-fixtures`), `apps/web/public/kitchen/icon-*.png` (from `apps/web/scripts/kitchen-icons.ts`),
  `apps/web/public/.well-known/apple-developer-merchantid-domain-association` (Apple's file, byte for byte),
  `docs/harolds-menu-reconciliation.xlsx`, and the frozen sprint-era docs in `docs/reference/`.
- Preferences with no effect on behaviour once the nit cap is reached.
- Problems in code the pull request did not touch (open a triage line instead).

## Tuning

Once a month: which findings were acted on and which were ignored. Remove a kind of finding nobody acts on; add
what review missed and a later bug showed.
