import type { ImportAdapter } from '../types';
import { productImportAdapter } from './productImportAdapter';
import { openingStockImportAdapter } from './openingStockImportAdapter';
import { stockTakeCountImportAdapter } from './stockTakeCountImportAdapter';
import { customerImportAdapter } from './customerImportAdapter';
import { supplierImportAdapter } from './supplierImportAdapter';

export { productImportAdapter } from './productImportAdapter';
export { openingStockImportAdapter } from './openingStockImportAdapter';
export { stockTakeCountImportAdapter } from './stockTakeCountImportAdapter';
export { customerImportAdapter } from './customerImportAdapter';
export { supplierImportAdapter } from './supplierImportAdapter';

/** Every adapter registered with the shared framework — the wizard's "Import type" step offers whichever of these the caller passes in and the current user has permission for. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a heterogeneous registry of ImportAdapter<T, C> for different T/C is only expressible generically; every real call site narrows to one concrete adapter.
export const allImportAdapters: ImportAdapter<any, any>[] = [
  productImportAdapter,
  openingStockImportAdapter,
  stockTakeCountImportAdapter,
  customerImportAdapter,
  supplierImportAdapter,
];
