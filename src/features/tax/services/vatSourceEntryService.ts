import type { ID, VatSourceEntry } from '@/types';
import type { IVatSourceEntryRepository } from '../repositories/IVatSourceEntryRepository';

/**
 * Read/append access to the persisted VAT source/evidence ledger (migration
 * 0080). The write path is normally the originating workflow itself (e.g.
 * `assetDisposalService` on a taxable disposal), which is handed the
 * repository directly; this service is the read side the VAT report and the
 * reversal flow use.
 */
export class VatSourceEntryService {
  constructor(private readonly repository: IVatSourceEntryRepository) {}

  async getEntries(): Promise<VatSourceEntry[]> {
    return this.repository.getAll();
  }

  async getEntriesForSource(sourceType: string, sourceId: ID): Promise<VatSourceEntry[]> {
    return this.repository.getBySource(sourceType, sourceId);
  }

  /**
   * Posts a contra entry that reverses `original` — negated amounts, same
   * classification, `reversesEntryId` set. Accounting evidence is never
   * destructively deleted; a reversal is a new row.
   */
  async reverseEntry(original: VatSourceEntry, reason: string): Promise<VatSourceEntry> {
    return this.repository.create({
      id: '',
      sourceType: original.sourceType,
      sourceId: original.sourceId,
      transactionDate: original.transactionDate,
      taxRateId: original.taxRateId,
      treatment: original.treatment,
      direction: original.direction,
      taxableAmount: -original.taxableAmount,
      vatAmount: -original.vatAmount,
      grossAmount: -original.grossAmount,
      classification: original.classification,
      journalEntryId: original.journalEntryId,
      reversesEntryId: original.id,
      reason,
      createdAt: '',
      updatedAt: '',
    });
  }
}
