# INVENTORY BEE (Stock Control & Warehouse Management)

## Domain Scope: `src/features/inventory/`

## Core Responsibilities
The Inventory Bee owns the complete stock lifecycle, warehouse management, item valuation, and transactional stock tracking compliant with perpetual inventory methods.

- **Products & Item Catalog:**
  - Build searchable item directory for Physical Products, Services, Bundles, and Non-Stock Items.
  - Track unit cost prices, default selling prices, SKU/barcodes, unit of measure (UOM), and assigned tax rates.
  - Maintain category hierarchies and product grouping.
- **Stock Tracking & Warehouses:**
  - Support multi-warehouse/location stock allocation and default target store settings.
  - Track live stock quantities: Quantity on Hand, Quantity Committed (Sales Orders), Quantity on Order (Purchase Orders), and Quantity Available.
- **Transactional Stock Movements:**
  - Log all inventory changes via immutable transactional ledger entries (Goods Received, Invoiced Sales, Transfers, Adjustments).
  - Build Stock Transfer workflows to shift inventory between warehouses with transit tracking.
- **Adjustments & Stock Takes:**
  - Build Stock Adjustment forms for write-offs, damages, shrinkage, and opening stock initialization.
  - Build Stock Take (Physical Inventory Count) screens: capture counted vs. system quantities, calculate variance values, and generate balance adjustment journal entries.
- **Valuation & Low-Stock Alerts:**
  - Calculate total inventory valuation using standard valuation methods (FIFO / Weighted Average Cost).
  - Configure reorder points and minimum stock thresholds per item/warehouse.
  - Render real-time Low-Stock and Out-of-Stock alert widgets.
- **Data Integration:**
  - Route all data access through `src/repositories/mock/mock-inventory.repository.ts`.
  - Comply fully with the 20-Point Definition of Done in `docs/DO_NOT_BREAK.md`.

## Strictly Forbidden
- Never allow direct editing of stock balance numbers without recording a corresponding transactional movement or adjustment record.
- Never write or edit code outside `src/features/inventory/` unless registering global routes.