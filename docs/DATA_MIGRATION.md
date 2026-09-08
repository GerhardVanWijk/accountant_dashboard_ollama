# Data Import & Migration Centre

Admin workspace for migrating accounting data into a Vertex company from
another system (or from a Vertex export), with mapping, validation and
reconciliation before anything is written. Ported from SLC — see
[SLC_IMPORT_PORT.md](./SLC_IMPORT_PORT.md). The generic import pipeline it
builds on is documented in
[IMPORT_EXPORT_ARCHITECTURE.md](./IMPORT_EXPORT_ARCHITECTURE.md).

## Routes

| Path | Page | Gate |
|---|---|---|
| `/admin/imports` | Overview — import type cards + source-system selector + banking hand-off | `data_migration:read` |
| `/admin/imports/history` | Every batch, with status and counts | `data_migration:read` |
| `/admin/imports/history/:batchId` | One batch — status, reconciliation, evidence, issues, signed source download | `data_migration:read` |
| `/admin/imports/mappings` | Saved column/account/tax mapping profiles | `data_migration:read` |
| `/admin/imports/exceptions` | Every open issue across every batch | `data_migration:read` |
| `/admin/imports/documents` | Supporting evidence documents | `data_migration:read` |
| `/admin/exports` | Data Export centre + templates + Vertex Migration Package | `data_migration:read` |

`admin` / `superuser` bypass. `accountant`, `finance_manager`, `bookkeeper`
have the full `read/import/create/update/export` grant. No other role can open
these pages — migration files can carry complete customer / supplier / banking
detail, so ordinary read access must not imply access to raw migration files.

## Lifecycle

`uploaded → mapping → (validation_failed | ready) → importing → (completed |
completed_with_warnings | failed)`, plus `cancelled` (a status change, never a
DELETE). Every uploaded file is kept in the private `import-sources` bucket.

Wizard flow: **upload → parse → (worksheet) → map columns → validate →
review issues → confirm → import → result**, then a batch-level audit entry.

## Safety

- **Preview and validate first.** Rows with blocking errors never import.
- **Explicit mapping only.** Exact column-alias suggestions are shown for
  confirmation; there is no fuzzy name/entity matching anywhere. An unresolved
  mapping goes to Exceptions.
- **Master data vs accounting.** Chart of Accounts / Customers / Suppliers /
  Products / Opening Stock write through the same services the rest of the app
  uses. They do **not** post to the GL.
- **Duplicate file detection** is a warning (SHA-256 content hash), never a
  hard block.
- Duplicate *records*: explicit `skip` / `update` / `error` strategy, chosen
  on the Review step.
- An evidence document upload **never** creates an accounting entry.

## Not available yet

Trial Balance, General Ledger detail, and AR/AP opening-balance imports need
to create a *draft* manual journal for human review before posting. Vertex has
no manual-journal-draft lifecycle yet, so these are shown on the Overview page
under "Not available yet" rather than offered. See
[SLC_IMPORT_PORT.md](./SLC_IMPORT_PORT.md#skipped--deferred).

## Reversal

There is no generic "undo import". Master-data records are edited or
deactivated through their normal screens. Posted accounting is only ever
corrected through normal reversal/correction mechanisms — an import is never
"undone" by deleting posted entries.

## SEO

All routes are authenticated admin routes: `noindex`, not in the sitemap.
