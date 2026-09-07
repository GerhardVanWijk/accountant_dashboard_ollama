# Product categories + the shared product picker

Branch `product-catalog-picker-2026-09-07`. Migration `0076`.

## The two category systems — which is authoritative

| | `products.category` (text) | `products.category_id` → `product_categories` |
|---|---|---|
| Migration | 0001-era | 0024 |
| Role | **denormalized mirror** — kept in step by the app (the form writes both), used for display fallback and reporting labels | **authoritative** — the FK the account resolver and the Categories page count from |
| Editable independently | **no** — it is only ever set from the chosen category's name (or cleared) | yes, via the Category selector on New/Edit Product |

`category_account_mappings` (migration 0019, keyed on the free-text name) is
a **frozen legacy duplicate** of the account columns that now live on
`product_categories`. `inventoryAccountResolver.ts` documents that a later
migration drops it and the `CategoryAccountMappingService` read path.

## Root cause of the 2026-09-07 QA findings

`SupabaseProductRepository` never selected, mapped or wrote
`products.category_id`. Every `Product` in the running app therefore had
`categoryId === undefined`, even though all 50 live products were fully
category-linked in the database. Downstream:

- **Categories page** counts by `p.categoryId` → 0 per row, "50
  uncategorised".
- **New/Edit Product** had only a free-text `<Input>` for `category`.
- **Account resolution** — `inventoryAccountResolver`'s category branch
  (product → category → generic) was unreachable; every product fell
  through to the generic `AccountMappingKey`.

Fixed by mapping the column in the repository (`ProductRow` /
`rowToProduct` / `productToRow`), replacing the form field with a
`SearchableSelect`, and letting the already-correct Categories page and
resolver see a populated `categoryId`.

**No backfill was required** — 50/50 products already linked, 0
exactly-matchable, 0 ambiguous, 0 unmatched. Migration 0076 carries a
guarded self-heal backfill (exact same-company name match, exactly-one, no
fuzzy matching, no inference from the product name) that is a no-op on the
live project, plus a `products_category_company_integrity` trigger that
rejects a `category_id` from another company (verified: 42501 for a
cross-company id, 23503 for a non-existent one).

## Account-resolution behaviour change (intended)

`inventoryAccountResolver.resolveForProduct(product, role)` precedence:

1. the product's own override column (`products.sales_account_id`, …)
2. the product's category (`product_categories`, via `category_id`)
3. the generic semantic `AccountMappingKey`

Branch 2 is now genuinely reachable. **Future** sales / purchase /
inventory postings for a categorised product resolve the category's
revenue / COGS / inventory account (e.g. 4010–4040 / 5010–5040 on the demo
company) instead of the generic 4000 / 5000. This is the designed
behaviour the `product_categories` account columns exist for; it was
dormant only because the app never read `category_id`.

- **Posted journals are not touched.**
- Trial Balance stays balanced (debits = credits regardless of which
  revenue account a line hits).
- GL 1200 (inventory) is unchanged — every category maps inventory → 1200.

## The shared product picker — `ProductCombobox`

`src/components/app/combobox/ProductCombobox.tsx`, built on
`SearchableSelect`. **One component, three contexts** — there is no second
picker.

```
context   primary price line        cost/WAC shown?
--------  ----------------------     -------------------------------------
sales     "<sell price> sell price" NEVER
purchase  "<cost> cost"             only with inventory:cost_edit
inventory "<cost> WAC"              only with inventory:cost_edit
```

`inventory:cost_edit` grantees are stock_controller + accountant; admin /
superuser bypass. An ordinary Sales user never sees margin data.

Result row:

```
HP LaserJet Pro 4103          ← product.name, the strongest element
HP-4103 · Printers            ← SKU · category name
12 on hand · R1 200.00 sell   ← stock + context-appropriate price
```

- **Stock**: warehouse-scoped when the line has a `warehouseId` +
  `onHandFor`; a company-wide aggregate is labelled "· all locations";
  "Out of stock" at zero; warning treatment for negative; nothing for a
  service / non-tracked product (no bogus "0 on hand").
- **Search**: always-visible, "by name, SKU or barcode".
- **Category filter**: in-popover chips from `product_categories`
  (company-scoped); filters on `products.categoryId`, never the free-text
  name.
- **Custom line**: "Custom line / service", set apart with a divider and
  its own icon, no stock/price metadata, maps to `null`.
- The line stays linked to the **Product**, never the category. Category is
  a filter / mapping / grouping layer only.

### Surfaces (all route through `ProductCombobox`)

| Surface | Editor | Context | Category filter | Warehouse-aware |
|---|---|---|---|---|
| Quote / Sales Order / Invoice / Credit Note | `SalesLineItemsEditor` | sales | ✔ | ✔ |
| Purchase Order / Bill | purchases `LineItemsEditor` | purchase | ✔ | ✔ |
| Opening Stock | `OpeningStockLinesEditor` | inventory | ✔ | ✔ |
| Stock Adjustment | `StockAdjustmentLinesEditor` | inventory | ✔ | ✔ |
| Stock Transfer | `StockTransferLinesEditor` | inventory | ✔ | from/to (no single line warehouse) |
| Supplier Return | `SupplierReturnLinesEditor` | inventory | ✔ | ✔ |
| Stock Take scope | `StockTakeSetupForm` | — | — | — (a multi-select scope picker, different semantics — deliberately not changed) |

Services / packages: this build's catalog is products only; the
`ProductCombobox` change does not touch any `serviceId` / `servicePackageId`
branching (there is none in the line editors today).
