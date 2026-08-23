import type { ID } from '@/types';
import type { RelatedParty, RelatedPartyTransaction } from '@/types/relatedParty';
import type { IRelatedPartyRepository } from '../repositories/IRelatedPartyRepository';

export type CreateRelatedPartyDTO = Omit<RelatedParty, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateRelatedPartyDTO = Partial<CreateRelatedPartyDTO>;

/** Minimal surface of the related-party-transaction store this service needs for the delete guard below. */
export interface RelatedPartyTransactionStore {
  getAll(): Promise<Pick<RelatedPartyTransaction, 'relatedPartyId'>[]>;
}

/**
 * Related Party master data (SA_ACCOUNTING_MASTER_SPEC.md §88 "RELATED
 * PARTIES") — a disclosure-support register, not an accounting/GL-posting
 * module. A related party record itself has no draft/posted lifecycle of
 * its own; it mirrors employeeService.ts's plain-CRUD shape.
 */
export class RelatedPartyService {
  constructor(
    private readonly repository: IRelatedPartyRepository,
    private readonly transactionStore: RelatedPartyTransactionStore,
  ) {}

  async getRelatedParties(): Promise<RelatedParty[]> {
    return this.repository.getAll();
  }

  async getRelatedParty(id: ID): Promise<RelatedParty | undefined> {
    return this.repository.getById(id);
  }

  async createRelatedParty(data: CreateRelatedPartyDTO): Promise<RelatedParty> {
    if (!data.name.trim()) {
      throw new Error('Related party name is required.');
    }
    const now = new Date().toISOString();
    return this.repository.create({ ...data, id: '', createdAt: now, updatedAt: now });
  }

  async updateRelatedParty(id: ID, patch: UpdateRelatedPartyDTO): Promise<RelatedParty> {
    if (patch.name !== undefined && !patch.name.trim()) {
      throw new Error('Related party name is required.');
    }
    return this.repository.update(id, patch);
  }

  /**
   * A related party referenced by any RelatedPartyTransaction can never
   * be deleted — same posted/referenced-record guard class as the 8
   * services covered in docs/KNOWN_ISSUES.md (see
   * employeeService.deleteEmployee()'s exact reasoning). Deleting the
   * party would silently orphan the transaction's relatedPartyId, and the
   * transaction is disclosure data that must remain traceable to who it
   * relates to.
   */
  async deleteRelatedParty(id: ID): Promise<void> {
    const relatedParty = await this.repository.getById(id);
    if (!relatedParty) {
      throw new Error(`Related party "${id}" not found.`);
    }
    const transactions = await this.transactionStore.getAll();
    const isReferenced = transactions.some((t) => t.relatedPartyId === id);
    if (isReferenced) {
      throw new Error(
        `Cannot delete "${relatedParty.name}": referenced by an existing related-party transaction. Remove its transactions first.`,
      );
    }
    return this.repository.delete(id);
  }
}
