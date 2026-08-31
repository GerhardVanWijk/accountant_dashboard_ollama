import type { NewSupplierReturnLine, SupplierReturn, SupplierReturnHeader, SupplierReturnLine } from '@/types';
import type { INormalizedInventoryDocumentRepository } from './INormalizedInventoryDocumentRepository';

/**
 * Supplier-return repository contract (migration 0029) — the purchase-side
 * mirror of ICreditNoteRepository. Same generic CRUD shape as
 * IWarehouseRepository. Persistent child rows with stable source identities
 * are hydrated into `lineItems`; totals recompute and the draft→posted transition
 * live in supplierReturnService, not here.
 */
export type ISupplierReturnRepository = INormalizedInventoryDocumentRepository<
  SupplierReturn, SupplierReturnLine, SupplierReturnHeader, Partial<SupplierReturnHeader>,
  NewSupplierReturnLine, Partial<NewSupplierReturnLine>
>;
