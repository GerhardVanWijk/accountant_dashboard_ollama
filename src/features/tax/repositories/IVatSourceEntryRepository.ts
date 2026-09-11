import type { ID, VatSourceEntry } from '@/types';

/**
 * Append-only VAT source/evidence contract (migration 0080). Same shape as
 * the other append-only accounting ledgers — create() is the only write
 * path; a reversal is a new contra row, never an update or delete.
 */
export interface IVatSourceEntryRepository {
  getAll(): Promise<VatSourceEntry[]>;
  getBySource(sourceType: string, sourceId: ID): Promise<VatSourceEntry[]>;
  create(entity: VatSourceEntry): Promise<VatSourceEntry>;
}
