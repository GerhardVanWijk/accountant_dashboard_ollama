import type { ID } from '@/types';
import type { RelatedParty, RelatedPartyTransaction } from '@/types/relatedParty';
import type { IRelatedPartyTransactionRepository } from '../repositories/IRelatedPartyTransactionRepository';

export type CreateRelatedPartyTransactionDTO = Omit<RelatedPartyTransaction, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateRelatedPartyTransactionDTO = Partial<CreateRelatedPartyTransactionDTO>;

/** Narrow, structural surface of RelatedPartyService this service consumes (read-only), same "narrow interface, real singleton injected" pattern used throughout this codebase (e.g. AssetDisposalLookup in capitalGainsService.ts). */
export interface RelatedPartyLookup {
  getRelatedParty(id: ID): Promise<RelatedParty | undefined>;
}

/**
 * Related Party Transaction records (SA_ACCOUNTING_MASTER_SPEC.md §88) —
 * disclosure-support data only, never posted to the GL. Unlike this
 * codebase's append-only GL-posting records, these support update/delete
 * since they are disclosure data an accountant may need to correct.
 */
export class RelatedPartyTransactionService {
  constructor(
    private readonly repository: IRelatedPartyTransactionRepository,
    private readonly relatedPartyLookup: RelatedPartyLookup,
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

  async createTransaction(data: CreateRelatedPartyTransactionDTO): Promise<RelatedPartyTransaction> {
    await this.assertValid(data);
    const now = new Date().toISOString();
    return this.repository.create({ ...data, id: '', createdAt: now, updatedAt: now });
  }

  async updateTransaction(id: ID, patch: UpdateRelatedPartyTransactionDTO): Promise<RelatedPartyTransaction> {
    await this.assertValid(patch);
    return this.repository.update(id, patch);
  }

  async deleteTransaction(id: ID): Promise<void> {
    return this.repository.delete(id);
  }
}
