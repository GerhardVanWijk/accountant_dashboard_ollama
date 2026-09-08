import type { ImportAdapter } from '../types';
import { productImportAdapter } from './productImportAdapter';
import { openingStockImportAdapter } from './openingStockImportAdapter';
import { stockTakeCountImportAdapter } from './stockTakeCountImportAdapter';
import { customerImportAdapter } from './customerImportAdapter';
import { supplierImportAdapter } from './supplierImportAdapter';
import { chartOfAccountsImportAdapter } from './chartOfAccountsImportAdapter';

export { productImportAdapter } from './productImportAdapter';
export { openingStockImportAdapter } from './openingStockImportAdapter';
export { stockTakeCountImportAdapter } from './stockTakeCountImportAdapter';
export { customerImportAdapter } from './customerImportAdapter';
export { supplierImportAdapter } from './supplierImportAdapter';
export { chartOfAccountsImportAdapter } from './chartOfAccountsImportAdapter';

/** Every adapter registered with the shared framework — the wizard's "Import type" step offers whichever of these the caller passes in and the current user has permission for. The embedded "Import" buttons on Customers/Suppliers/Inventory pages use this set. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a heterogeneous registry of ImportAdapter<T, C> for different T/C is only expressible generically; every real call site narrows to one concrete adapter.
export const allImportAdapters: ImportAdapter<any, any>[] = [
  productImportAdapter,
  openingStockImportAdapter,
  stockTakeCountImportAdapter,
  customerImportAdapter,
  supplierImportAdapter,
];

/**
 * Every adapter offered by the Data Import & Migration Centre
 * (`/admin/imports`), in the recommended migration order (Chart of Accounts
 * → master data → opening balances). Master-data adapters are the SAME
 * instances as `allImportAdapters` — no duplicate implementation, just also
 * reachable from the new centre.
 *
 * Trial Balance / General Ledger detail / AR & AP opening-balance imports
 * are DEFERRED: they each need to create a *draft* manual journal, and
 * Vertex's `journalEntryService` has no manual-journal-draft lifecycle yet
 * (see docs/SLC_IMPORT_PORT.md). They will be added once that lands.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const migrationImportAdapters: ImportAdapter<any, any>[] = [
  chartOfAccountsImportAdapter,
  customerImportAdapter,
  supplierImportAdapter,
  productImportAdapter,
  openingStockImportAdapter,
];
