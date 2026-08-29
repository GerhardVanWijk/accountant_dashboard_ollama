import type { SupabaseClient } from '@supabase/supabase-js';
import type { BankStatementLine, ID } from '@/types';
import type { IBankStatementLineRepository } from './IBankStatementLineRepository';
import { resolveDefaultCompanyId } from '@/repositories/resolveDefaultCompanyId';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface BankStatementLineRow {
  id: string;
  bank_statement_id: string;
  bank_account_id: string;
  sequence: number;
  txn_date: string;
  value_date: string | null;
  description: string;
  reference: string | null;
  external_ref_id: string | null;
  amount: number;
  direction: string;
  running_balance: number | null;
  raw_source: Record<string, unknown> | null;
  line_state: string;
  matched_bank_transaction_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToLine(row: BankStatementLineRow): BankStatementLine {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    bankStatementId: row.bank_statement_id,
    bankAccountId: row.bank_account_id,
    sequence: Number(row.sequence),
    txnDate: row.txn_date,
    valueDate: row.value_date ?? undefined,
    description: row.description,
    reference: row.reference ?? undefined,
    externalRefId: row.external_ref_id ?? undefined,
    amount: Number(row.amount),
    direction: row.direction as BankStatementLine['direction'],
    runningBalance: row.running_balance == null ? undefined : Number(row.running_balance),
    rawSource: row.raw_source ?? {},
    lineState: row.line_state as BankStatementLine['lineState'],
    matchedBankTransactionId: row.matched_bank_transaction_id ?? undefined,
  };
}

function lineToRow(entity: Partial<BankStatementLine>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.bankStatementId !== undefined) row.bank_statement_id = entity.bankStatementId;
  if (entity.bankAccountId !== undefined) row.bank_account_id = entity.bankAccountId;
  if (entity.sequence !== undefined) row.sequence = entity.sequence;
  if (entity.txnDate !== undefined) row.txn_date = entity.txnDate;
  if (entity.valueDate !== undefined) row.value_date = entity.valueDate ?? null;
  if (entity.description !== undefined) row.description = entity.description;
  if (entity.reference !== undefined) row.reference = entity.reference ?? null;
  if (entity.externalRefId !== undefined) row.external_ref_id = entity.externalRefId ?? null;
  if (entity.amount !== undefined) row.amount = entity.amount;
  if (entity.direction !== undefined) row.direction = entity.direction;
  if (entity.runningBalance !== undefined) row.running_balance = entity.runningBalance ?? null;
  if (entity.rawSource !== undefined) row.raw_source = entity.rawSource ?? {};
  if (entity.lineState !== undefined) row.line_state = entity.lineState;
  if (entity.matchedBankTransactionId !== undefined) row.matched_bank_transaction_id = entity.matchedBankTransactionId ?? null;
  return row;
}

/**
 * Supabase-backed IBankStatementLineRepository (migration 0020,
 * `bank_statement_lines`). Bulk insert with the parent statement, then
 * point patches on the matching path. `company_id` resolved server-side at
 * `createMany()`. RLS-scoped `_all_own_company` `{authenticated}`.
 */
export class SupabaseBankStatementLineRepository implements IBankStatementLineRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseBankStatementLineRepository');
    return this.cachedCompanyId;
  }

  async createMany(lines: BankStatementLine[]): Promise<BankStatementLine[]> {
    if (lines.length === 0) return [];
    const companyId = await this.resolveCompanyId();
    const payload = lines.map((line) => ({ ...lineToRow(line), company_id: companyId }));
    const { data, error } = await this.client.from('bank_statement_lines').insert(payload).select('*');
    if (error) throw new Error(`SupabaseBankStatementLineRepository.createMany: ${error.message}`);
    return (data as BankStatementLineRow[]).map(rowToLine);
  }

  async getByStatement(bankStatementId: ID): Promise<BankStatementLine[]> {
    const { data, error } = await this.client
      .from('bank_statement_lines')
      .select('*')
      .eq('bank_statement_id', bankStatementId)
      .order('sequence', { ascending: true });
    if (error) {
      if (isInvalidUuidError(error)) return [];
      throw new Error(`SupabaseBankStatementLineRepository.getByStatement: ${error.message}`);
    }
    return (data as BankStatementLineRow[]).map(rowToLine);
  }

  async getByAccountInWindow(bankAccountId: ID, from: string, to: string): Promise<BankStatementLine[]> {
    const { data, error } = await this.client
      .from('bank_statement_lines')
      .select('*')
      .eq('bank_account_id', bankAccountId)
      .gte('txn_date', from)
      .lte('txn_date', to)
      .order('txn_date', { ascending: true });
    if (error) {
      if (isInvalidUuidError(error)) return [];
      throw new Error(`SupabaseBankStatementLineRepository.getByAccountInWindow: ${error.message}`);
    }
    return (data as BankStatementLineRow[]).map(rowToLine);
  }

  async update(id: ID, patch: Partial<BankStatementLine>): Promise<BankStatementLine> {
    const { data, error } = await this.client
      .from('bank_statement_lines')
      .update(lineToRow(patch))
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`SupabaseBankStatementLineRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseBankStatementLineRepository: line "${id}" not found`);
    return rowToLine(data as BankStatementLineRow);
  }
}
