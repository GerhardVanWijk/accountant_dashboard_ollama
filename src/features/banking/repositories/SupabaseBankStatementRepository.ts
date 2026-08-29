import type { SupabaseClient } from '@supabase/supabase-js';
import type { BankStatement, ID } from '@/types';
import type { IBankStatementRepository } from './IBankStatementRepository';
import { resolveDefaultCompanyId } from '@/repositories/resolveDefaultCompanyId';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface BankStatementRow {
  id: string;
  bank_account_id: string;
  reference: string | null;
  source_filename: string | null;
  source_format: string | null;
  period_start: string;
  period_end: string;
  opening_balance: number;
  closing_balance: number;
  currency: string;
  line_count: number;
  import_status: string;
  reconciliation_status: string;
  content_hash: string | null;
  imported_at: string | null;
  imported_by: string | null;
  balance_check_ok: boolean | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function rowToStatement(row: BankStatementRow): BankStatement {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    bankAccountId: row.bank_account_id,
    reference: row.reference ?? undefined,
    sourceFilename: row.source_filename ?? undefined,
    sourceFormat: (row.source_format as BankStatement['sourceFormat']) ?? undefined,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    openingBalance: Number(row.opening_balance),
    closingBalance: Number(row.closing_balance),
    currency: row.currency,
    lineCount: Number(row.line_count),
    importStatus: row.import_status as BankStatement['importStatus'],
    reconciliationStatus: row.reconciliation_status as BankStatement['reconciliationStatus'],
    contentHash: row.content_hash ?? undefined,
    importedAt: row.imported_at ?? undefined,
    importedBy: row.imported_by ?? undefined,
    balanceCheckOk: row.balance_check_ok ?? undefined,
    notes: row.notes ?? undefined,
  };
}

function statementToRow(entity: Partial<BankStatement>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.bankAccountId !== undefined) row.bank_account_id = entity.bankAccountId;
  if (entity.reference !== undefined) row.reference = entity.reference ?? null;
  if (entity.sourceFilename !== undefined) row.source_filename = entity.sourceFilename ?? null;
  if (entity.sourceFormat !== undefined) row.source_format = entity.sourceFormat ?? null;
  if (entity.periodStart !== undefined) row.period_start = entity.periodStart;
  if (entity.periodEnd !== undefined) row.period_end = entity.periodEnd;
  if (entity.openingBalance !== undefined) row.opening_balance = entity.openingBalance;
  if (entity.closingBalance !== undefined) row.closing_balance = entity.closingBalance;
  if (entity.currency !== undefined) row.currency = entity.currency;
  if (entity.lineCount !== undefined) row.line_count = entity.lineCount;
  if (entity.importStatus !== undefined) row.import_status = entity.importStatus;
  if (entity.reconciliationStatus !== undefined) row.reconciliation_status = entity.reconciliationStatus;
  if (entity.contentHash !== undefined) row.content_hash = entity.contentHash ?? null;
  if (entity.importedAt !== undefined) row.imported_at = entity.importedAt ?? null;
  if (entity.importedBy !== undefined) row.imported_by = entity.importedBy ?? null;
  if (entity.balanceCheckOk !== undefined) row.balance_check_ok = entity.balanceCheckOk ?? null;
  if (entity.notes !== undefined) row.notes = entity.notes ?? null;
  return row;
}

/**
 * Supabase-backed IBankStatementRepository (migration 0020,
 * `bank_statements`). Mutable CRUD, snake↔camel mapping exactly like
 * SupabaseBankTransactionRepository; RLS-scoped `_all_own_company`
 * `{authenticated}`. Resolves "the" company internally at `create()` time.
 */
export class SupabaseBankStatementRepository implements IBankStatementRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseBankStatementRepository');
    return this.cachedCompanyId;
  }

  async create(entity: BankStatement): Promise<BankStatement> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('bank_statements')
      .insert({ ...statementToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseBankStatementRepository.create: ${error.message}`);
    return rowToStatement(data as BankStatementRow);
  }

  async getById(id: ID): Promise<BankStatement | undefined> {
    const { data, error } = await this.client.from('bank_statements').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseBankStatementRepository.getById: ${error.message}`);
    }
    return data ? rowToStatement(data as BankStatementRow) : undefined;
  }

  async getByAccount(bankAccountId: ID): Promise<BankStatement[]> {
    const { data, error } = await this.client
      .from('bank_statements')
      .select('*')
      .eq('bank_account_id', bankAccountId)
      .order('period_start', { ascending: false });
    if (error) {
      if (isInvalidUuidError(error)) return [];
      throw new Error(`SupabaseBankStatementRepository.getByAccount: ${error.message}`);
    }
    return (data as BankStatementRow[]).map(rowToStatement);
  }

  async getByCompany(): Promise<BankStatement[]> {
    const { data, error } = await this.client.from('bank_statements').select('*').order('period_start', { ascending: false });
    if (error) throw new Error(`SupabaseBankStatementRepository.getByCompany: ${error.message}`);
    return (data as BankStatementRow[]).map(rowToStatement);
  }

  async update(id: ID, patch: Partial<BankStatement>): Promise<BankStatement> {
    const { data, error } = await this.client.from('bank_statements').update(statementToRow(patch)).eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(`SupabaseBankStatementRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseBankStatementRepository: statement "${id}" not found`);
    return rowToStatement(data as BankStatementRow);
  }

  async findByContentHash(bankAccountId: ID, hash: string): Promise<BankStatement | undefined> {
    const { data, error } = await this.client
      .from('bank_statements')
      .select('*')
      .eq('bank_account_id', bankAccountId)
      .eq('content_hash', hash)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseBankStatementRepository.findByContentHash: ${error.message}`);
    }
    return data ? rowToStatement(data as BankStatementRow) : undefined;
  }
}
