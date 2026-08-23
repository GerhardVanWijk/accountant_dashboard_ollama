import type { SupabaseClient } from '@supabase/supabase-js';
import type { BankAccount, ID } from '@/types';
import type { IBankAccountRepository } from './IBankAccountRepository';
import { resolveDefaultCompanyId } from '@/repositories/resolveDefaultCompanyId';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface BankAccountRow {
  id: string;
  name: string;
  bank_name: string;
  account_number: string;
  account_type: string;
  currency: string;
  opening_balance: number;
  current_balance: number;
  gl_account_id: string;
  status: string;
  branch_code: string | null;
  swift_code: string | null;
  created_at: string;
  updated_at: string;
}

function rowToBankAccount(row: BankAccountRow): BankAccount {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    name: row.name,
    bankName: row.bank_name,
    accountNumber: row.account_number,
    accountType: row.account_type as BankAccount['accountType'],
    currency: row.currency,
    openingBalance: Number(row.opening_balance),
    currentBalance: Number(row.current_balance),
    glAccountId: row.gl_account_id,
    status: row.status as BankAccount['status'],
    branchCode: row.branch_code ?? undefined,
    swiftCode: row.swift_code ?? undefined,
  };
}

function bankAccountToRow(entity: Partial<BankAccount>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.name !== undefined) row.name = entity.name;
  if (entity.bankName !== undefined) row.bank_name = entity.bankName;
  if (entity.accountNumber !== undefined) row.account_number = entity.accountNumber;
  if (entity.accountType !== undefined) row.account_type = entity.accountType;
  if (entity.currency !== undefined) row.currency = entity.currency;
  if (entity.openingBalance !== undefined) row.opening_balance = entity.openingBalance;
  if (entity.currentBalance !== undefined) row.current_balance = entity.currentBalance;
  if (entity.glAccountId !== undefined) row.gl_account_id = entity.glAccountId;
  if (entity.status !== undefined) row.status = entity.status;
  if (entity.branchCode !== undefined) row.branch_code = entity.branchCode;
  if (entity.swiftCode !== undefined) row.swift_code = entity.swiftCode;
  return row;
}

/**
 * Supabase-backed IBankAccountRepository (docs/SUPABASE_MIGRATION_GUIDE.md
 * Phase D). Resolves "the" company internally at create() time — same
 * single-tenant pattern as SupabaseAccountRepository. Bank Transactions and
 * Reconciliations (the transactional ledger, as opposed to this master
 * record) stay Mock — Phase E's scope, not this one.
 */
export class SupabaseBankAccountRepository implements IBankAccountRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseBankAccountRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<BankAccount[]> {
    const { data, error } = await this.client.from('bank_accounts').select('*').order('name', { ascending: true });
    if (error) throw new Error(`SupabaseBankAccountRepository.getAll: ${error.message}`);
    return (data as BankAccountRow[]).map(rowToBankAccount);
  }

  async getById(id: ID): Promise<BankAccount | undefined> {
    const { data, error } = await this.client.from('bank_accounts').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseBankAccountRepository.getById: ${error.message}`);
    }
    return data ? rowToBankAccount(data as BankAccountRow) : undefined;
  }

  async create(entity: BankAccount): Promise<BankAccount> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('bank_accounts')
      .insert({ ...bankAccountToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseBankAccountRepository.create: ${error.message}`);
    return rowToBankAccount(data as BankAccountRow);
  }

  async update(id: ID, patch: Partial<BankAccount>): Promise<BankAccount> {
    const { data, error } = await this.client.from('bank_accounts').update(bankAccountToRow(patch)).eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(`SupabaseBankAccountRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseBankAccountRepository: bank account "${id}" not found`);
    return rowToBankAccount(data as BankAccountRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('bank_accounts').delete().eq('id', id);
    if (error) throw new Error(`SupabaseBankAccountRepository.delete: ${error.message}`);
  }
}
