# Help Centre (Administration module — Block F)

Route `/help` + `/help/:articleId`. Static content only — a real,
searchable knowledge base for the **implemented** Vertex product. No live
chat, ticketing, AI support or knowledge-base ingestion — none of those
exist, so none are faked.

## Content

`src/features/help/content/` — 59 articles as typed data
(`HelpArticle[]`), across 13 categories:

Getting started · Sales · Purchasing · Banking · Inventory · Accounting ·
Tax & compliance · Fixed assets · Payroll · Reporting · Administration ·
Security & privacy · Troubleshooting

Feature articles carry, where applicable:

- **What this does** / **Before you begin** / **How to use it**
- **Permissions required** (the role/level that can use the feature)
- **Accounting impact** (the GL effect, for anything that posts)
- **Common problems** (linked to the troubleshooting articles)
- **Related articles**

Every article describes behaviour that is actually built. Features that are
**not** built are named as such rather than documented as if present:
payslip / IRP5 generation, notes to the financial statements, statement of
changes in equity, FIFO valuation for new products, a transaction currency
distinct from ZAR, document-numbering prefixes, a configurable rounding
rule, a default-account map.

## Troubleshooting

14 articles, one per case the brief lists, each based on real Vertex
behaviour:

`ts-cannot-create-company` · `ts-cannot-add-user` · `ts-invitation-expired`
· `ts-cannot-access-module` · `ts-module-locked` · `ts-company-suspended` ·
`ts-invoice-wont-post` · `ts-journal-wont-post` · `ts-bank-wont-reconcile`
· `ts-inventory-quantity-wrong` · `ts-vat-differs` · `ts-period-locked` ·
`ts-document-upload-failed` · `ts-notification-wont-clear`

## Data Import & Migration Centre (2026-09-08)

15 Administration-category articles covering the ported import/export
subsystem, each reflecting actual implemented behaviour (no native
Pastel/Sage/Xero/Syspro connector is claimed anywhere):

`data-migration` · `import-preparing-file` · `import-csv` · `import-excel` ·
`import-mapping-profiles` · `import-validation` · `import-exceptions` ·
`import-history` · `import-evidence-documents` · `data-export` ·
`import-duplicate-files` · `import-no-fuzzy-mapping` ·
`import-accounting-unavailable` · `import-bank-vs-migration` ·
`import-security-isolation`

Guarded by `src/features/help/content/dataMigrationArticles.test.ts`.

## Search — `searchHelp(query)` (`content/index.ts`)

Ranked over title / exact-title / keyword / summary / body. Scoring puts an
exact-title or title-word hit **far** above a body-only mention, and every
query term must appear somewhere for an article to be a hit. Results carry
a body snippet.

Examples (covered by `content/helpSearch.test.ts`):

| Query | Top result |
|---|---|
| `invoice won't post` | `ts-invoice-wont-post` |
| `bank will not reconcile` | `ts-bank-wont-reconcile` |
| `why is a module locked` | `ts-module-locked` |
| `vat` | `vat` |
| `reconciliation` | `bank-reconciliation` |
| `debtors` | `customers` (keyword-only match) |

## Contextual help — `<HelpLink article="…" />`

`src/features/help/components/HelpLink.tsx`. A compact, unobtrusive link
rendered as a plain `<a>` (context-free — safe in any page header, no
Router needed). Renders nothing if the article id is unknown, so a typo
can never ship a dead link.

Embedded in the page headers of the complex workflows the brief calls out:

- Bank reconciliation → `bank-reconciliation`
- Journal entries → `journal-entries`
- Stock operations → `inventory-adjustments`
- VAT → `vat`
- Forecasting → `forecasting`
- Users & roles → `users-roles`
- Company documents → `documents`
- Data Migration overview → `data-migration`
- Mapping Profiles → `import-mapping-profiles`
- Import Exceptions → `import-exceptions`
- Data Export centre → `data-export`

(Notifications guidance is on the Notifications page itself and in Settings
→ Notifications; the `notifications` article covers it.)

## Pages

- **`HelpPage`** (`/help`) — search box + browse by category. When a query
  is present it shows ranked results; otherwise "Start here" (Getting
  started) plus every category.
- **`HelpArticlePage`** (`/help/:articleId`) — sectioned body, permissions
  and accounting-impact callouts, related-article list, a deep link to the
  feature the article is about. Unknown id → a "not found" state that links
  back to `/help`.

Neither page is permission-gated (documentation).
