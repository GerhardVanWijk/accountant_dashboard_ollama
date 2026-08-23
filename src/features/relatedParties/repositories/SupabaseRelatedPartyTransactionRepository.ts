import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID, RelatedPartyTransaction } from '@/types';
import type { IRelatedPartyTransactionRepository } from './IRelatedPartyTransactionRepository';
import { resolveDefaultCompanyId } from '@/repositories/resolveDefaultCompanyId';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface RelatedPartyTransactionRow {
  id: string;
  related_party_id: string;
  transaction_date: string;
  nature_of_transaction: string;
  amount: number;
  description: string | null;
  source_reference: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRelatedPartyTransaction(row: RelatedPartyTransactionRow): RelatedPartyTransaction {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    relatedPartyId: row.related_party_id,
    transactionDate: row.transaction_date,
    natureOfTransaction: row.nature_of_transaction,
    amount: Number(row.amount),
    description: row.description ?? undefined,
    sourceReference: row.source_reference ?? undefined,
  };
}

function relatedPartyTransactionToRow(entity: Partial<RelatedPartyTransaction>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.relatedPartyId !== undefined) row.related_party_id = entity.relatedPartyId;
  if (entity.transactionDate !== undefined) row.transaction_date = entity.transactionDate;
  if (entity.natureOfTransaction !== undefined) row.nature_of_transaction = entity.natureOfTransaction;
  if (entity.amount !== undefined) row.amount = entity.amount;
  if (entity.description !== undefined) row.description = entity.description;
  if (entity.sourceReference !== undefined) row.source_reference = entity.sourceReference;
  return row;
}

/**
 * Supabase-backed IRelatedPartyTransactionRepository
 * (docs/SUPABASE_MIGRATION_GUIDE.md Phase G). `RelatedPartyTransaction` has
 * no `companyId` field — resolved internally. `natureOfTransaction` is
 * stored as free text, matching the TS type exactly (no closed enum —
 * see the type's doc comment on why one was deliberately not fabricated).
 */
export class SupabaseRelatedPartyTransactionRepository implements IRelatedPartyTransactionRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId)
      this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseRelatedPartyTransactionRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<RelatedPartyTransaction[]> {
    const { data, error } = await this.client.from('related_party_transactions').select('*').order('transaction_date', { ascending: true });
    if (error) throw new Error(`SupabaseRelatedPartyTransactionRepository.getAll: ${error.message}`);
    return (data as RelatedPartyTransactionRow[]).map(rowToRelatedPartyTransaction);
  }

  async getById(id: ID): Promise<RelatedPartyTransaction | undefined> {
    const { data, error } = await this.client.from('related_party_transactions').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseRelatedPartyTransactionRepository.getById: ${error.message}`);
    }
    return data ? rowToRelatedPartyTransaction(data as RelatedPartyTransactionRow) : undefined;
  }

  async create(entity: RelatedPartyTransaction): Promise<RelatedPartyTransaction> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('related_party_transactions')
      .insert({ ...relatedPartyTransactionToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseRelatedPartyTransactionRepository.create: ${error.message}`);
    return rowToRelatedPartyTransaction(data as RelatedPartyTransactionRow);
  }

  async update(id: ID, patch: Partial<RelatedPartyTransaction>): Promise<RelatedPartyTransaction> {
    const { data, error } = await this.client
      .from('related_party_transactions')
      .update(relatedPartyTransactionToRow(patch))
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`SupabaseRelatedPartyTransactionRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseRelatedPartyTransactionRepository: related party transaction "${id}" not found`);
    return rowToRelatedPartyTransaction(data as RelatedPartyTransactionRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('related_party_transactions').delete().eq('id', id);
    if (error) throw new Error(`SupabaseRelatedPartyTransactionRepository.delete: ${error.message}`);
  }
}
