import type { ID } from '@/types';
import type { RelatedParty, RelatedPartySourceDocumentType, RelatedPartyTransaction } from '@/types/relatedParty';
import type { IRelatedPartyTransactionRepository } from '../repositories/IRelatedPartyTransactionRepository';

export type CreateRelatedPartyTransactionDTO = Omit<RelatedPartyTransaction, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateRelatedPartyTransactionDTO = Partial<CreateRelatedPartyTransactionDTO>;

/** Narrow, structural surface of RelatedPartyService this service consumes (read-only), same "narrow interface, real singleton injected" pattern used throughout this codebase (e.g. AssetDisposalLookup in capitalGainsService.ts). */
export interface RelatedPartyLookup {
  getRelatedParty(id: ID): Promise<RelatedParty | undefined>;
}

/** One real accounting record resolved by (type, id) — the authoritative amount/date/reference a linked transaction derives from. Never re-typed independently once linked. */
export interface ResolvedSourceDocument {
  amount: number;
  date: string;
  /** A human-readable reference for the record, e.g. an invoice/bill/receipt/payment number, or a journal entry number — used to fill `sourceReference` for display, never re-typed manually once linked. */
  reference: string;
}

/**
 * Resolves a real accounting record by (sourceDocumentType, id) — the
 * mechanism `createTransaction()`/`updateTransaction()` use to DERIVE
 * amount/date/reference instead of trusting a manually re-typed
 * duplicate (Tax & Compliance integrity audit continuation, 2026-09-12,
 * §10: "do not require users to manually retype values that can drift").
 * Optional — a service constructed without one still supports the
 * Manual/Other route (no sourceDocumentType set) exactly as before;
 * attempting to LINK a source without a lookup configured is rejected
 * explicitly rather than silently accepting an unvalidated id.
 */
export interface SourceDocumentLookup {
  resolve(type: RelatedPartySourceDocumentType, id: ID): Promise<ResolvedSourceDocument | undefined>;
}

/**
 * Related Party Transaction records (SA_ACCOUNTING_MASTER_SPEC.md §88) —
 * disclosure-support data only, never posted to the GL. Unlike this
 * codebase's append-only GL-posting records, these support update/delete
 * since they are disclosure data an accountant may need to correct.
 *
 * A transaction is EITHER linked to a real accounting record
 * (sourceDocumentType + sourceDocumentId, both set — amount/
 * transactionDate/sourceReference are then DERIVED from that record, not
 * manually entered) OR Manual/Other (neither set — a legitimate
 * disclosure this codebase has no matching accounting record for,
 * entered manually with its own amount/date). There is no third,
 * half-linked state: `assertValid()` rejects one of the pair being set
 * without the other, mirroring migration 0106's own CHECK constraint —
 * the same invariant enforced at two layers, not just hoped for at one.
 */
export class RelatedPartyTransactionService {
  constructor(
    private readonly repository: IRelatedPartyTransactionRepository,
    private readonly relatedPartyLookup: RelatedPartyLookup,
    private readonly sourceDocumentLookup?: SourceDocumentLookup,
  ) {}

  async getTransactions(): Promise<RelatedPartyTransaction[]> {
    return this.repository.getAll();
  }

  async getTransactionsForParty(relatedPartyId: ID): Promise<RelatedPartyTransaction[]> {
    const all = await this.repository.getAll();
    return all.filter((t) => t.relatedPartyId === relatedPartyId);
  }

  private async assertValid(data: { relatedPartyId?: ID; natureOfTransaction?: string; amount?: number }): Promise<void> {
    if (data.relatedPartyId !== undefined) {
      const relatedParty = await this.relatedPartyLookup.getRelatedParty(data.relatedPartyId);
      if (!relatedParty) {
        throw new Error(`Related party "${data.relatedPartyId}" does not exist.`);
      }
    }
    if (data.natureOfTransaction !== undefined && !data.natureOfTransaction.trim()) {
      throw new Error('Nature of transaction is required.');
    }
    if (data.amount !== undefined && Number.isNaN(data.amount)) {
      throw new Error('Amount must be a valid number.');
    }
  }

  /**
   * When a source is being linked (sourceDocumentType + sourceDocumentId
   * both present in the incoming data), resolves the real record and
   * returns the DERIVED amount/transactionDate/sourceReference to apply —
   * the caller-supplied amount/transactionDate for a linked transaction
   * are always overridden, never trusted, so they can never silently
   * drift from the source. Returns `undefined` for a Manual/Other write
   * (neither field present) — nothing to derive, the caller's own
   * amount/date stand as entered.
   */
  private async resolveSource(data: {
    sourceDocumentType?: RelatedPartySourceDocumentType;
    sourceDocumentId?: ID;
  }): Promise<Pick<RelatedPartyTransaction, 'amount' | 'transactionDate' | 'sourceReference'> | undefined> {
    const hasType = data.sourceDocumentType !== undefined;
    const hasId = data.sourceDocumentId !== undefined;
    if (hasType !== hasId) {
      throw new Error('sourceDocumentType and sourceDocumentId must both be set to link a source record, or both left unset for a Manual/Other transaction.');
    }
    if (!hasType || !hasId) {
      return undefined;
    }
    if (!this.sourceDocumentLookup) {
      throw new Error('Cannot link a source record: no SourceDocumentLookup is configured for this service.');
    }
    const resolved = await this.sourceDocumentLookup.resolve(data.sourceDocumentType!, data.sourceDocumentId!);
    if (!resolved) {
      throw new Error(`No ${data.sourceDocumentType} record "${data.sourceDocumentId}" was found to link.`);
    }
    return { amount: resolved.amount, transactionDate: resolved.date, sourceReference: resolved.reference };
  }

  async createTransaction(data: CreateRelatedPartyTransactionDTO): Promise<RelatedPartyTransaction> {
    await this.assertValid(data);
    const derived = await this.resolveSource(data);
    const now = new Date().toISOString();
    return this.repository.create({ ...data, ...derived, id: '', createdAt: now, updatedAt: now });
  }

  async updateTransaction(id: ID, patch: UpdateRelatedPartyTransactionDTO): Promise<RelatedPartyTransaction> {
    await this.assertValid(patch);
    const derived = await this.resolveSource(patch);
    return this.repository.update(id, { ...patch, ...derived });
  }

  async deleteTransaction(id: ID): Promise<void> {
    return this.repository.delete(id);
  }
}
