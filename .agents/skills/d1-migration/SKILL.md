---
name: d1-migration
description: "How to change the D1 (SQLite) schema safely — numbered migration files, expand/migrate/contract, CHECK/UNIQUE constraints, indexes with EXPLAIN QUERY PLAN, D1 limits, wrangler commands. Use for any SQL, table, column, index or migration change."
---
# D1 migration

1. **One new file per change:** `apps/backend/migrations/NNNN_<snake_case>.sql`, numbered after the highest existing file. Never edit a migration that has been merged. After rebasing on `develop`, renumber yours if the number collides. Wrangler applies files in order and tracks them in the `d1_migrations` table.
2. **Expand → migrate → contract.** First add nullable columns or new tables. Backfill as a separate step. Drop or rename in a later PR, once no deployed code reads the old shape.
3. **SQLite specifics:**
   - `ALTER TABLE` can only add or rename a column. Anything else is create new → copy → drop → rename inside one migration. Put `PRAGMA defer_foreign_keys = true;` at the top if foreign keys would fail mid-rebuild.
   - Enums are `CHECK(status IN (...))`. Times are `INTEGER` epoch ms (UTC). IDs are `TEXT` UUIDs. Use `NOT NULL` with defaults wherever possible.
4. **Dedup lives in constraints, not code:** `UNIQUE` on `dedupe_key`, `idempotency_key`, `update_id`.
5. **Indexes:**
   - Every new query path gets an index whose leftmost columns match `WHERE`, then `ORDER BY` (e.g. `(status, run_at, id)`). A partial index (`WHERE status IN ('queued','retry_wait')`) suits a hot queue scan.
   - Verify with `EXPLAIN QUERY PLAN`: the expected output is `SEARCH … USING INDEX`. Run `PRAGMA optimize` after adding indexes.
6. **Limits to design for:**
   - 100 KB per statement and 100 bound parameters.
   - 2 MB per row/value and 30 s per query.
   - 50 queries per invocation on the Free plan (1 000 paid).
   - 500 MB per database on Free.
   - D1 executes queries one at a time, so keep each one fast.
   - There are no interactive transactions; `batch()` is atomic.
7. **Commands** (use the database *name*, not the binding):
   - `npx wrangler d1 migrations create <db-name> <title>`
   - `npx wrangler d1 migrations apply <db-name> --local`

   Agents never run `--remote` against production. Staging or production applies are run by the owner, after creating a Time Travel bookmark for risky changes.
8. **Tests:** integration tests apply every migration to an empty local D1 (`applyD1Migrations`, see skill `testing`). A migration that rewrites data gets a test with representative rows.
9. **Deleting a module's data** happens only after its code has been removed and deployed, in its own migration PR.

Before you finish: the migration applies cleanly from zero, the new queries show `USING INDEX`, and numbering is unique and sequential.

Sources: `references/sources.md`.
