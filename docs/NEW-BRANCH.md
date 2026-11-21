# Opening a new branch

One codebase serves every Harold's location. Each branch is its own **deployment**: its own
`.env`, PostgreSQL database, domain, NMI merchant account and in-store printer. Nothing about
the location is hardcoded; it comes from `STORE_BRANCH_NAME` and the branch's database.

## 1. Environment (`.env` on the new branch's server)

| Variable | New value |
|---|---|
| `STORE_BRANCH_NAME` | The location, e.g. `Zion` → "Harold's Chicken Zion". Set before building. |
| `DATABASE_URL` | A new, empty database. Never share one with another branch. |
| `NEXT_PUBLIC_APP_URL` | The branch's live domain (also becomes the SEO canonical host at seed time). |
| `NMI_*` | The branch's own Merchant Pay Connect keys; register its webhook at `<domain>/api/v1/webhooks/nmi`. |
| `PAYMENTS_APPLE_PAY_ENABLED` | Leave `false` until the new domain is registered with Apple and `public/.well-known/apple-developer-merchantid-domain-association` is the file for that domain. |
| `PRINTER_SERIAL_NUMBER`, `PRINTER_SDP_SHARED_SECRET` | The new store's Epson printer; a fresh secret. |
| `EMAIL_FROM_ADDRESS`, manager alert contacts | The branch's own. |

Google Ads: `GOOGLE_TAG_ID` in `packages/config/src/google-tag.ts` is shared by every branch. Make
it per-branch only if the new location has its own Ads account.

## 2. Database

Each branch has its own menu workbook: `docs/menus/harolds-<branch>-menu.xlsx`
(`harolds-burnham-menu.xlsx`, `harolds-zion-menu.xlsx`). The seed picks the file from
`STORE_BRANCH_NAME`, and there is no shared default, so one branch's menu cannot land in
another's database.

```
pnpm db:migrate:deploy
pnpm db:seed:menu:zion     # or db:seed:menu:burnham; plain db:seed:menu uses STORE_BRANCH_NAME
```

The per-branch scripts refuse to run when their branch does not match `STORE_BRANCH_NAME` in
`.env`. A new location: add `docs/menus/harolds-<branch>-menu.xlsx` (copy an existing one as the
template) and a matching `seed:menu:<branch>` script in `packages/db/package.json` and the root
`package.json`. `WORKBOOK_PATH=<file>` still overrides the file for a one-off.

The menu seed also inserts, only when absent: the store config row (branch name, plus
placeholders for address and phone: `TODO: SET ADDRESS`, `TODO: SET CITY`,
`TODO: CONFIRM PHONE`, ZIP `00000`), opening hours (10:30–23:00 every day), and it rewrites the
SEO site defaults to this branch's name and domain while they still hold the migration's
untouched Burnham values. Nothing else needs a script: the SEO rows come from the migrations, and
order numbers, closures and curation start empty.

Back-office accounts: copy `seed-accounts.example.json` to `seed-accounts.json` at the repository
root (gitignored, like `.env`, so passwords are never committed), list the real accounts, then run
`pnpm db:seed:accounts`. It works in production, checks every password against the back office's
rules (8+ characters, a letter and a number, not containing the email name) before writing
anything, and only creates accounts that do not exist yet: re-running it never resets a password
changed since. Kitchen PINs are set afterwards on /admin/staff.

`pnpm db:seed:test-accounts` creates the three fixed test logins. Development only; it refuses
production.

## 3. Back office, before taking orders

- **Store:** address, city, state, ZIP, phone, **tax rate** (seeded at Burnham's 10.10% —
  confirm the new municipality's rate), opening hours, order number prefix (`HC-`; consider a
  distinct prefix so tickets from two branches cannot be confused), manager alert phone/email.
- **SEO:** business name, address, phone, hours.
- **Staff:** kitchen PINs for the seeded accounts, and the rest of the staff. Never run the test-accounts seed in production.

## 4. Build and start

```
pnpm build
pnpm start
```
