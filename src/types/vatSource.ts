import type { BaseEntity, ID, ISODateString } from './common';
import type { VatTreatment } from './taxRate';

export type VatDirection = 'output' | 'input';

/**
 * Persisted VAT source/evidence for a taxable transaction that originates
 * OUTSIDE the Invoice / Credit Note / Supplier Invoice pipeline (migration
 * 0080) — starting with taxable fixed-asset disposals. The VAT reporting
 * engine (`vatReportService`) reads these rows alongside its document
 * sources, so a disposal's output VAT reaches the VAT return and the VAT
 * control-account reconciliation, not just the GL.
 *
 * Append-only. A reversal / correction is a new contra row (negated
 * amounts) referencing the original via `reversesEntryId`.
 */
export interface VatSourceEntry extends BaseEntity {
  /** e.g. 'asset_disposal'. Open to any future non-document VAT event. */
  sourceType: string;
  /** The originating record's id (e.g. the AssetDisposal id). */
  sourceId: ID;
  transactionDate: ISODateString;
  /** Authoritative effective-dated rate reference — never a free-typed percentage. */
  taxRateId: ID;
  /** Denormalised from the resolved rate — the branch the VAT report classifies on. */
  treatment: VatTreatment;
  direction: VatDirection;
  /** Net / ex-VAT consideration. */
  taxableAmount: number;
  vatAmount: number;
  /** taxableAmount + vatAmount. */
  grossAmount: number;
  /** Coarse reporting tag, e.g. 'capital_goods'. */
  classification?: string;
  journalEntryId?: ID;
  /** Set on a contra row that reverses an earlier entry. */
  reversesEntryId?: ID;
  reason?: string;
}
