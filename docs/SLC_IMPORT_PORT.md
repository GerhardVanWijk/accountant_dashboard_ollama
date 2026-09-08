# SLC → Vertex: Data Import / Migration / Export port

Branch `import-export-light-mode-2026-09-08`. Records what was ported from the
Sovereign Legacy Capital (SLC) codebase into Vertex, what was adapted, and
what was deliberately left out.

## Source

| | |
|---|---|
| SLC repo | `C:\Users\USER-PC\Documents\CODING\SovereignLegacyCapitalDashboard` (READ ONLY — not modified) |
| SLC branch | `staging` |
| SLC source commits | `a64398c` *feat: add data migration and operational readiness tools*, `c80b464` *feat(import): complete data migration and export centre (Phase D closure)* |
| Vertex base commit | `105ab10` (main) |
| SLC feature folder | `src/features/import/` — covers **both** import and export |
| SLC backend | migrations `0069` (schema), `0070` (permissions), `0071` (MIME allow-list), `0072` (permission narrowing) |

## Company-model adaptation

SLC has diverged to a multi-company model (`company_memberships`,
`profiles.active_company_id`). Vertex stays single-company
(`profiles.company_id`). **None of the multi-company concepts were ported.**
Every import service already resolves the company through the
`get_my_company_id()` RPC only, so the service layer ports unchanged — the RPC
itself is what differs between the two products, not its callers.

## Migrations created in Vertex

| Vertex migration | Merges SLC | Notes |
|---|---|---|
| `0077_data_migration_centre_schema` | SLC `0069` + `0071` | 4 tables (`import_mapping_profiles`, `import_batches`, `import_batch_issues`, `import_evidence_documents`), 2 private Storage buckets (`import-sources`, `import-evidence`) with bucket-level `file_size_limit` + `allowed_mime_types`, 3 SECURITY DEFINER RPCs (`create_import_batch`, `create_import_evidence_document`, `remove_import_evidence_document`). Company-scoped RLS on every table; storage policies require the object path's first segment to equal `get_my_company_id()`. Applied to live 2026-09-08. |
| `0078_data_migration_centre_permissions` | SLC `0070` + `0072` (final granted state) | `data_migration` feature — actions `read / import / create / update / export`. Granted to `accountant`, `finance_manager`, `bookkeeper`. `admin` / `superuser` bypass via `useCanAccess()`. Applied to live 2026-09-08. |

No SLC migration numbers were reused. Nothing touches an existing table's RLS
or any posted-accounting table.

## Port matrix

### Ported directly (rebrand only: "SLC" → "Vertex", `slc_package` → `vertex_package`)

| File | Purpose |
|---|---|
| `migration/types.ts` | DB-row ↔ app-object shapes for the 4 tables |
| `migration/fileHash.ts` | SHA-256 of a `File` (duplicate-file detection) |
| `migration/importBatchService.ts` | batch lifecycle: create (via RPC + Storage upload), validate, complete, fail, cancel; issue read/resolve; signed source-file URL |
| `migration/importMappingProfileService.ts` | list / save / duplicate / (de)activate mapping profiles |
| `migration/importEvidenceService.ts` | evidence upload / list / remove / signed URL (PDF/JPG/PNG only, 10 MB) |
| `migration/bankStatementSummary.ts` | read-only summary over the existing `bank_statements` table |
| `migration/accountMapping.ts` | external-account-code → Vertex account, exact-code suggestion only, never fuzzy |
| `migration/taxMapping.ts` | external-tax-code → Vertex tax rate, exact code/rate/alias only |
| `migration/reconciliation.ts` | per-batch reconciliation (opening-stock branch live; TB/AR/AP branches are dead code until those adapters land) |
| `migration/reports.ts` | CSV exception report + full result report (reuses `@/features/export/csvExport`) |
| `migration/migrationPackage.ts` | build / validate / re-extract a Vertex Migration Package (`manifest.json` + typed CSV sections, hashed) |
| `hooks/useImportWizard.ts` | wizard state machine — SLC superset (adds account-mapping + tax-mapping steps, saved-profile apply, batch tracking) |
| `components/ImportWizard.tsx` | the one wizard UI — SLC superset (Account Mapping + Tax Mapping steps inline) |
| `types.ts` (feature root) | SLC superset of the generic `ImportAdapter` contract (adds `requiresAccountMapping` / `requiresTaxMapping` / `recordRef` / `metadata` / date-type confirm fields) |
| `adapters/chartOfAccountsImportAdapter.ts` | Chart of Accounts import — calls `accountService` only, never posts GL |
| `pages/ImportHistoryPage.tsx` | batch list + cancel |
| `pages/ImportBatchDetailPage.tsx` | one batch — status, reconciliation, draft-journal note, evidence, issues, signed source download |
| `pages/MappingProfilesPage.tsx` | profile list, duplicate, activate/deactivate |
| `pages/ExceptionsPage.tsx` | every open issue across every batch, filter + resolve/ignore + CSV |
| `pages/ImportDocumentsPage.tsx` | evidence upload / list / open / remove |

### Adapted

| File | Change |
|---|---|
| `migration/sourceSystemProfiles.ts` | `slc_package` → `vertex_package`; wording. Pastel/Sage, Xero, Syspro remain **labelling-only** (see below) |
| `migration/templates.ts` | dropped Trial Balance / AR / AP templates (deferred adapters); kept Chart of Accounts, Customers, Suppliers, Products |
| `adapters/index.ts` | `migrationImportAdapters` = Chart of Accounts, Customers, Suppliers, Products, Opening Stock. The 4 accounting-event adapters removed |
| `pages/DataMigrationOverviewPage.tsx` | removed the 4 deferred import cards; added an honest "Not available yet" section listing them |
| `pages/DataExportCentrePage.tsx` | rebrand only. Export rows for Trial Balance / GL / AR / AP opening are **exports** (read-only, safe) and were kept; only the *re-import* section is limited to CoA/Customers/Suppliers/Products |
| `components/status-badge.tsx` | added `ImportBatchStatus` + `bank_statements` status entries |
| `lib/app/navigation.ts`, `features/auth/permissionRouteMap.ts`, `app/router.tsx`, `permissionCatalogHardening.test.ts` | 7 routes under `/admin/imports*` + `/admin/exports`, nav items under Administration, `data_migration` route gate |
| `DataMigrationOverviewPage.tsx` (theme follow-up) | removed an SLC hardcoded navy shadow → design-system `shadow-sm` |
| 4 page headers | `<HelpLink>` to the relevant Help article (Overview, Mapping Profiles, Exceptions, Data Export) |
| `src/features/help/content/articles.ts` | +15 Administration-category Help articles (see docs/HELP_CENTRE.md) |

### Skipped / deferred

| SLC file | Why |
|---|---|
| `adapters/trialBalanceImportAdapter.ts` | Needs `journalEntryService.createManualDraft()` — **Vertex has no manual-journal-draft lifecycle** |
| `adapters/glDetailImportAdapter.ts` | same |
| `adapters/arOpeningImportAdapter.ts` | same |
| `adapters/apOpeningImportAdapter.ts` | same |
| SLC `0057_manual_journal_draft_lifecycle` migration + `journalEntryService.createManualDraft/postManualDraft` + repository layer + a UI to post drafts | This is its own feature. Vertex's `journal_entries` enum already has `'draft'`, but no app path creates or posts one, and adding it requires schema columns (`reference`, `journal_type`, `internal_notes`), repo/service/type/test changes across the accounting module, and a "post draft" action on the Journals screen. Out of scope for this task. |

The `AccountMappingStep` / `TaxMappingStep` in `ImportWizard.tsx` and
`migration/accountMapping.ts` / `taxMapping.ts` were kept as a **reusable
foundation** — they are wired but currently unreachable (no shipped adapter
sets `requiresAccountMapping`). They become live when the 4 deferred adapters
land.

## Source systems actually supported

| System | Status |
|---|---|
| Generic CSV / Excel | **Supported** — hand-mapped or from a saved profile |
| Pastel / Sage | **Labelling only** — no native backup/DB parser; upload an exported CSV/XLSX and map columns manually. No verified column layout is built in. |
| Xero | **Labelling only** — file-based, not a live API/OAuth connection |
| Syspro | **Labelling only** — no fixed column layout assumed |
| Vertex Migration Package | **Supported** — re-import a package this Vertex instance generated |

No source-system-specific column alias is injected anywhere — every file goes
through the same generic exact-alias `suggestColumnMapping()`.

## Working import types

Chart of Accounts, Customers, Suppliers, Products, Opening Stock (master data
+ the existing draft-capable opening-stock batch flow). All write through the
same services the rest of the app uses; none post to the GL directly.

## Storage

- Two **private** buckets: `import-sources` (original uploaded file, never
  deleted by a client), `import-evidence` (supporting PDFs/images).
- Object path is `<company_id>/<uuid>-<safe-filename>`; storage RLS requires
  the first path segment to equal `get_my_company_id()`, and `SELECT` also
  requires a matching metadata row.
- Bucket-level `file_size_limit` (10 MB) + `allowed_mime_types` make the
  client-side format/size rule unbypassable.
- Downloads are 60-second signed URLs only — no public URL, no raw path
  exposed.

## Gate

- Import/export increment (2026-09-08): `type-check` PASS · `lint` PASS ·
  `test` 3029/3029 · `build` PASS · advisors **0 ERROR**.
- Theme + Help + tests continuation (2026-09-08): `type-check` PASS · `lint`
  PASS · `test` **3045/3045** · `build` PASS. No new migration, **no DB
  writes**, so advisors unchanged.

Accounting baseline: Trial Balance difference **R0.00** throughout. GL 1200
Inventory / journal count / stock-movement count moved between the two runs
(R1,478,853.74 → **R1,513,353.74**, 247 → **248** journals, 343 → **344**
movements) purely from a concurrent operational bill posting (`JE-4177`,
source `bill`) — none of this port's work (import feature wrote 0 rows; the
continuation wrote 0 rows) touched accounting.

Live verification: mapping profile + batch + issue + evidence document inserted
against a real company inside a transaction and rolled back — all FKs, enums,
CHECK constraints and unique indexes satisfied, **0 artifacts persisted**.

## Not done

- Merge to `main` — NO. Deploy — NO. Human browser QA required (import/export
  workspace **and** the softened light mode — see docs/LIGHT_MODE.md).
- The `data_migration` grant covers the Chart of Accounts import and the
  centre itself for accountant / finance_manager / bookkeeper. The shared
  Customers / Suppliers / Products / Opening Stock adapters keep their own
  domain `*:import` gate (none of which any system role holds), so within the
  centre those types are admin/superuser-only until a small grant migration
  is added. Noted in docs/KNOWN_ISSUES.md; out of scope for a theme/help
  continuation.
