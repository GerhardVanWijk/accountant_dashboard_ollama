import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID } from '@/types';
import type { BankTransactionAllocation, BankTransactionWithAllocations } from '../types';
import type { IBankTransactionRepository } from './IBankTransactionRepository';
import { resolveDefaultCompanyId } from '@/repositories/resolveDefaultCompanyId';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface BankTransactionRow {
  id: string;
  bank_account_id: string;
  date: string;
  description: string;
  reference: string | null;
  amount: number;
  direction: string;
  status: string;
  matched_entity_id: string | null;
  category: string | null;
  source: string | null;
  journal_entry_id: string | null;
  transfer_pair_id: string | null;
  reconciliation_id: string | null;
  allocations: BankTransactionAllocation[];
  created_at: string;
  updated_at: string;
}

function rowToBankTransaction(row: BankTransactionRow): BankTransactionWithAllocations {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    bankAccountId: row.bank_account_id,
    date: row.date,
    description: row.description,
    reference: row.reference ?? undefined,
    amount: Number(row.amount),
    direction: row.direction as BankTransactionWithAllocations['direction'],
    status: row.status as BankTransactionWithAllocations['status'],
    matchedEntityId: row.matched_entity_id ?? undefined,
    category: row.category ?? undefined,
    source: (row.source as BankTransactionWithAllocations['source']) ?? undefined,
    journalEntryId: row.journal_entry_id ?? undefined,
    transferPairId: row.transfer_pair_id ?? undefined,
    reconciliationId: row.reconciliation_id ?? undefined,
    allocations: row.allocations ?? [],
  };
}

function bankTransactionToRow(entity: Partial<BankTransactionWithAllocations>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.bankAccountId !== undefined) row.bank_account_id = entity.bankAccountId;
  if (entity.date !== undefined) row.date = entity.date;
  if (entity.description !== undefined) row.description = entity.description;
  if (entity.reference !== undefined) row.reference = entity.reference;
  if (entity.amount !== undefined) row.amount = entity.amount;
  if (entity.direction !== undefined) row.direction = entity.direction;
  if (entity.status !== undefined) row.status = entity.status;
  if (entity.matchedEntityId !== undefined) row.matched_entity_id = entity.matchedEntityId;
  if (entity.category !== undefined) row.category = entity.category;
  if (entity.source !== undefined) row.source = entity.source;
  if (entity.journalEntryId !== undefined) row.journal_entry_id = entity.journalEntryId;
  if (entity.transferPairId !== undefined) row.transfer_pair_id = entity.transferPairId;
  if (entity.reconciliationId !== undefined) row.reconciliation_id = entity.reconciliationId;
  if (entity.allocations !== undefined) row.allocations = entity.allocations;
  return row;
}

/**
 * Supabase-backed IBankTransactionRepository (docs/SUPABASE_MIGRATION_GUIDE.md
 * Phase E). Resolves "the" company internally at create() time. Works in
 * terms of `BankTransactionWithAllocations` (BankTransaction + its
 * split-allocation lines), matching the interface exactly — `allocations`
 * round-trips as a single jsonb column, same treatment as every other
 * nested list this migration handles.
 */
export class SupabaseBankTransactionRepository implements IBankTransactionRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseBankTransactionRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<BankTransactionWithAllocations[]> {
    const { data, error } = await this.client.from('bank_transactions').select('*').order('date', { ascending: true });
    if (error) throw new Error(`SupabaseBankTransactionRepository.getAll: ${error.message}`);
    return (data as BankTransactionRow[]).map(rowToBankTransaction);
  }

  async getById(id: ID): Promise<BankTransactionWithAllocations | undefined> {
    const { data, error } = await this.client.from('bank_transactions').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseBankTransactionRepository.getById: ${error.message}`);
    }
    return data ? rowToBankTransaction(data as BankTransactionRow) : undefined;
  }

  async getByAccount(bankAccountId: ID): Promise<BankTransactionWithAllocations[]> {
    const { data, error } = await this.client
      .from('bank_transactions')
      .select('*')
      .eq('bank_account_id', bankAccountId)
      .order('date', { ascending: true });
    if (error) {
      if (isInvalidUuidError(error)) return [];
      throw new Error(`SupabaseBankTransactionRepository.getByAccount: ${error.message}`);
    }
    return (data as BankTransactionRow[]).map(rowToBankTransaction);
  }

  async create(entity: BankTransactionWithAllocations): Promise<BankTransactionWithAllocations> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('bank_transactions')
      .insert({ ...bankTransactionToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseBankTransactionRepository.create: ${error.message}`);
    return rowToBankTransaction(data as BankTransactionRow);
  }

  async update(id: ID, patch: Partial<BankTransactionWithAllocations>): Promise<BankTransactionWithAllocations> {
    const { data, error } = await this.client
      .from('bank_transactions')
      .update(bankTransactionToRow(patch))
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`SupabaseBankTransactionRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseBankTransactionRepository: bank transaction "${id}" not found`);
    return rowToBankTransaction(data as BankTransactionRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('bank_transactions').delete().eq('id', id);
    if (error) throw new Error(`SupabaseBankTransactionRepository.delete: ${error.message}`);
  }
}
