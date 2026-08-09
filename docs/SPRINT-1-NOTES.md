# Sprint 1 Notes — Foundation

Harold's Chicken Oak Lawn — monorepo, Prisma schema, migrations, and menu/store seed.

---

## Data conventions (project standard)

These apply to every model for the remainder of the project:

1. **Primary keys** are string CUIDs (`@default(cuid())`). Exception: `OrderNumberCounter` / `StoreConfig` use the fixed id `"default"`.
2. **Money** is always an `Int` field whose name ends in `Cents`. Never float, never `Decimal`, never `Numeric`.
3. **Timestamps:** every record-bearing model has `createdAt` and `updatedAt`.
4. **No soft deletes.** Menu entities use `isActive`. Historical orders keep their own snapshots.
5. **Display order** uses an explicit `sortOrder` integer — never insertion order or alphabetical fallback.
6. **Enums** are declared in Prisma and re-exported from `@harolds/types`.
7. **Every foreign key has an explicit index.**
8. **Cascade behaviour is explicit** on every relation (see schema comments):
   - `Category` → `MenuItem`: `Restrict` (do not orphan/delete items by deleting a category)
   - `ModifierGroup` → `ModifierOption`: `Cascade`
   - `ItemModifierGroup`: `Cascade` on both sides
   - `Order` → `OrderLine` / `PrintJob`: `Cascade`
   - `OrderLine` → `MenuItem`: `SetNull` (analytics link only; never destroy history)
9. **Workbook natural keys** (`workbookId`) are stored on menu entities for idempotent seeding.

---

## Local PostgreSQL setup (Windows)

1. Install PostgreSQL (this machine uses 18.x). Confirm the service `postgresql-x64-18` is running and port `5432` is listening.
2. Create a database (via pgAdmin or `psql`):

   ```sql
   CREATE DATABASE harolds;
   ```

3. Prefer a dedicated application role in shared environments. For local solo development, the `postgres` superuser is acceptable. That role needs **`CREATEDB`** so Prisma can create/drop a **shadow database** during `pnpm db:migrate` (`prisma migrate dev`).

   ```sql
   ALTER USER postgres CREATEDB;
   -- Or, for a dedicated role:
   -- CREATE ROLE harolds_app LOGIN PASSWORD '...';
   -- CREATE DATABASE harolds OWNER harolds_app;
   -- ALTER ROLE harolds_app CREATEDB;
   ```

4. Connection URL format:

   ```
   postgresql://USER:PASSWORD@localhost:5432/harolds?schema=public
   ```

5. Confirm connectivity:

   ```bash
   psql "postgresql://USER:PASSWORD@localhost:5432/harolds" -c "SELECT 1;"
   ```

**Shadow database note:** `prisma migrate dev` creates and drops a temporary database. The production role on Ubuntu should **not** have `CREATEDB`; production uses `pnpm db:migrate:deploy` (`prisma migrate deploy`), which does not need a shadow database.

**Choice made for this machine:** use the existing `postgres` superuser with `CREATEDB` rather than configuring an explicit `SHADOW_DATABASE_URL`.

---

## Migration workflow

| Command | When | Behaviour |
|---|---|---|
| `pnpm db:migrate` → `prisma migrate dev` | Local development only | May prompt, may create a shadow DB, may reset data if you allow it |
| `pnpm db:migrate:deploy` → `prisma migrate deploy` | Ubuntu production deploy | Applies pending migrations non-interactively; never resets |

**Never run `pnpm db:migrate` against the production server.** The Ubuntu deployment uses `pnpm db:migrate:deploy` only.

---

## Deviations from the sprint prompt

1. **Store identity placeholders** — street address, postal code, and contact phone were not present in the workbook. Seeded as obvious `TODO: …` placeholders rather than inventing plausible values. Listed under outstanding inputs.
2. **Uniform opening hours** — exact per-day hours were unavailable. Seeded 10:30–23:00 every day (matching the mid-morning → late-evening storefront hours described in the prompt). Per-day hours remain outstanding.
3. **Item `sortOrder`** — the `items` sheet has no sort_order column. Sort order is derived from row order within each category during seed.
4. **pnpm version** — the environment runs pnpm 11.x; `packageManager` is pinned to 9.15.0 per the prompt's "pin the pnpm version" instruction. Install still works under pnpm 11. `.npmrc` uses `node-linker=hoisted` to ease Windows standalone builds.
5. **API route group placeholder** — Sprint 1 forbids API handlers, so `(api)/api/page.tsx` is a placeholder page at `/api` (not a `route.ts`). Handlers arrive in Sprint 2.
6. **shadcn/ui** — initialised via `components.json`, Tailwind CSS variables, `cn()` helper, and neutral base. No UI components were added (no UI work this sprint beyond placeholders).
7. **Next.js `envDir`** — not supported in Next 15.5; root `.env` is loaded from `next.config.ts` via `dotenv` instead.
8. **Windows standalone build** — requires Developer Mode (symlink privilege). Hit EPERM before Developer Mode was enabled.

---

## Surprises in the generated SQL

1. Prisma emits `TIMESTAMP(3)` for `DateTime` and `TEXT` for `String` — expected for PostgreSQL.
2. Money columns are all `INTEGER` — confirmed; no `NUMERIC`/`DOUBLE PRECISION`.
3. Enum types are created as PostgreSQL enums with the exact values declared.
4. Composite indexes `[status, printerSerial]` and `[status, runAfter]` appear as expected.
5. `StoreClosure.date` uses `@db.Date` → SQL `DATE`.
6. `tipPresetsBps Int[]` → PostgreSQL `INTEGER[]`.
7. No unexpected `ON DELETE CASCADE` beyond what the schema declared (verified against migration SQL).
8. **Singleton enforcement:** a `CHECK (id = 'default')` constraint (`StoreConfig_singleton_check`) was added to the initial migration SQL so a second `StoreConfig` row with any other id is rejected (PK alone only blocks duplicate `"default"`).

---

## Outstanding business inputs

- Real modifier groups per item (only 4 provisional groups exist; reconstructed from screenshots / DoorDash modals)
- Item photographs (`imageUrl` seeded null)
- Verified prices for the 8 `PLACEHOLDER` items (beverages + desserts)
- Exact per-day opening hours (including Friday/Saturday late close if any)
- Store street address
- Store postal code
- Store contact phone
- Confirmation of yellow-flagged menu conflicts (`CONFLICT` / `DUPLICATE?` / `REVIEW` rows) — seed inserts them verbatim; admin will resolve later
- Final order-number prefix / starting sequence confirmation (seeded as `HC` / `1000`)

---

## Commands: clean clone → seeded database

```bash
pnpm install
cp .env.example .env   # then edit DATABASE_URL / NODE_ENV / NEXT_PUBLIC_APP_URL
pnpm db:generate
pnpm db:migrate        # development only
pnpm db:seed
pnpm db:verify
pnpm dev
```

Currency conversion self-test (optional but recommended after seed changes):

```bash
pnpm --filter @harolds/db test:currency
```
