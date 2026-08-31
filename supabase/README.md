# Supabase migrations

## Where this folder came from

This `migrations/` folder was **backfilled on 2026-08-30** from the live
Supabase project's applied migration history
(`supabase_migrations.schema_migrations`), for traceability. Before that date
there was no `supabase/` directory in the repo at all.

Migrations **0000-0020** were authored and applied directly against the live
database via the Supabase MCP (`apply_migration`) during the Phase A-T build,
*before* this folder existed. The `.sql` files for those 20+1 migrations here
are a faithful, byte-for-byte reconstruction of the statements the live project
actually ran - each was verified against the MD5 of the stored
`schema_migrations.statements` for its version. They are recorded for history;
re-applying them is neither expected nor needed (the live project is already at
`0020`).

Each backfilled file starts with a 2-line header comment noting its source and
its `version` / `name`.

## Going forward

New migrations from **0021 onward** - the Inventory Accounting Module and
anything after it - are authored **here first**, reviewed, and only then applied
to the live database via `apply_migration` after the relevant approval gate. The
live DB is shared, so nothing in this folder is applied automatically.

## Inventory Accounting Module 0021-0030 - APPLIED 2026-08-30 (Review 2C Hybrid)

After Review 2C approval each was applied via `apply_migration` and its file
renamed from the authored `20260830120021__...` placeholder to the recorded
`schema_migrations.version`:

| logical | recorded version | logical | recorded version |
|---|---|---|---|
| 0021 | `20260830155625` | 0026 | `20260830155907` |
| 0022 | `20260830155713` | 0027 | `20260830155950` |
| 0023 | `20260830155738` | 0028 | `20260830160020` |
| 0024 | `20260830155811` | 0029 | `20260830160052` |
| 0025 | `20260830155844` | 0030 | `20260830160120` |

Each file body produces a byte-identical schema to what was applied. For 0022 /
0027 / 0028 / 0029 the file's leading `--` comment block is fuller than the
trimmed text stored in `schema_migrations.statements`; the DDL is identical.
Replaying this folder in filename order reproduces production.

## Filename convention

**Every migration file**, including authored/reviewed migrations that have not
yet been applied, uses:

```
<timestamp>__<NNNN>_<name>.sql
```

- `<timestamp>` - a unique UTC `YYYYMMDDHHMMSS` version that orders the files
  chronologically. A new migration must use a version later than every version
  already present in this folder.
- `<NNNN>` - the zero-padded logical sequence number (`0000`, `0001`, ...).
- `<name>` - a short snake_case description.

Examples:

- applied history: `20260828114433__0020_bank_statements_and_evidence.sql`
- authored/unapplied: `20260830120021__0021_inventory_stock_movement_types.sql`

Never use a bare `<NNNN>_<name>.sql` filename. Supabase sorts migrations by the
leading numeric version, so a bare `0021_...` file sorts before timestamped
historical migrations and makes a fresh install run out of dependency order.
This previously caused logical migration 0021 to attempt `ALTER TYPE` before
the migration that creates the enum.

Allocate unique, strictly increasing timestamp versions when migrations are
authored, while retaining the logical `__<NNNN>` label for review traceability.
When migrations are applied, the deployment workflow may retain these authored
versions or record the versions returned by the actual application mechanism.
In either case, reconcile the local filename with the version recorded in
`supabase_migrations.schema_migrations` and preserve strict chronological order;
do not temporarily fall back to a bare logical filename.
