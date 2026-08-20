/**
 * Shared Tailwind class strings for form controls across the inventory
 * feature's forms (ProductForm, WarehouseForm, StockTransferForm,
 * StockAdjustmentForm) — semantic design tokens only, no hardcoded colors
 * (docs/DESIGN_SYSTEM.md).
 */
export const fieldLabel = 'mb-xs block text-sm font-medium text-text-primary';
export const fieldInput =
  'w-full rounded-md border border-border bg-background px-sm py-xs text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary';
export const fieldError = 'mt-xs text-xs text-danger';
export const fieldHint = 'mt-xs text-xs text-text-secondary';
