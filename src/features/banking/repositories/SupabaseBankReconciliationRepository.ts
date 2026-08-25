import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID } from '@/types';
import type { BankReconciliation } from '../types';
import type { IBankReconciliationRepository } from './IBankReconciliationRepository';
import { resolveDefaultCompanyId } from '@/repositories/resolveDefaultCompanyId';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface ReconciliationRow {
  id: string;
  bank_account_id: string;
  statement_date: string;
  statement_balance: number;
  gl_cashbook_balance: number;
  adjusted_bank_balance: number;
  variance: number;
  cleared_transaction_ids: string[];
  unpresented_transaction_ids: string[];
  uncleared_deposit_ids: string[];
  finalized_at: string;
  finalized_by_user_id: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function rowToBankReconciliation(row: ReconciliationRow): BankReconciliation {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    bankAccountId: row.bank_account_id,
    statementDate: row.statement_date,
    statementBalance: Number(row.statement_balance),
    glCashbookBalance: Number(row.gl_cashbook_balance),
    adjustedBankBalance: Number(row.adjusted_bank_balance),
    variance: Number(row.variance),
    clearedTransactionIds: row.cleared_transaction_ids ?? [],
    unpresentedTransactionIds: row.unpresented_transaction_ids ?? [],
    unclearedDepositIds: row.uncleared_deposit_ids ?? [],
    finalizedAt: row.finalized_at,
    finalizedByUserId: row.finalized_by_user_id,
    notes: row.notes ?? undefined,
  };
}

/**
 * INSERT-only mapping — deliberately no id/createdAt/updatedAt (DB-generated
 * defaults), matching every other SupabaseXxxRepository's toRow() convention.
 */
function reconciliationToRow(entity: BankReconciliation): Record<string, unknown> {
  return {
    bank_account_id: entity.bankAccountId,
    statement_date: entity.statementDate,
    statement_balance: entity.statementBalance,
    gl_cashbook_balance: entity.glCashbookBalance,
    adjusted_bank_balance: entity.adjustedBankBalance,
    variance: entity.variance,
    cleared_transaction_ids: entity.clearedTransactionIds,
    unpresented_transaction_ids: entity.unpresentedTransactionIds,
    uncleared_deposit_ids: entity.unclearedDepositIds,
    finalized_at: entity.finalizedAt,
    finalized_by_user_id: entity.finalizedByUserId,
    notes: entity.notes ?? null,
  };
}

/**
 * Supabase-backed IBankReconciliationRepository
 * (docs/SUPABASE_MIGRATION_GUIDE.md, `reconciliations` table). Deliberately
 * narrower than a generic CRUD repository, matching the interface exactly:
 * getAll()/getById()/getByAccount()/create() only — no update()/delete()
 * exist on this class at all, the same append-only shape as
 * SupabaseJournalEntryRepository/SupabaseAuditLogRepository. The DB layer
 * enforces the same thing independently (RLS has no UPDATE/DELETE policy on
 * `reconciliations`, and UPDATE/DELETE/TRUNCATE are explicitly revoked from
 * `authenticated`) — a finalized reconciliation cannot be mutated even by a
 * bug in this class, let alone a caller.
 *
 * Resolves "the" company internally at create() time, same pattern as
 * SupabaseBankAccountRepository/SupabaseBankTransactionRepository —
 * BankReconciliation carries no companyId field.
 */
export class SupabaseBankReconciliationRepository implements IBankReconciliationRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseBankReconciliationRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<BankReconciliation[]> {
    const { data, error } = await this.client.from('reconciliations').select('*').order('finalized_at', { ascending: true });
    if (error) throw new Error(`SupabaseBankReconciliationRepository.getAll: ${error.message}`);
    return (data as ReconciliationRow[]).map(rowToBankReconciliation);
  }

  async getById(id: ID): Promise<BankReconciliation | undefined> {
    const { data, error } = await this.client.from('reconciliations').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseBankReconciliationRepository.getById: ${error.message}`);
    }
    return data ? rowToBankReconciliation(data as ReconciliationRow) : undefined;
  }

  async getByAccount(bankAccountId: ID): Promise<BankReconciliation[]> {
    const { data, error } = await this.client
      .from('reconciliations')
      .select('*')
      .eq('bank_account_id', bankAccountId)
      .order('finalized_at', { ascending: true });
    if (error) {
      if (isInvalidUuidError(error)) return [];
      throw new Error(`SupabaseBankReconciliationRepository.getByAccount: ${error.message}`);
    }
    return (data as ReconciliationRow[]).map(rowToBankReconciliation);
  }

  async create(entity: BankReconciliation): Promise<BankReconciliation> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('reconciliations')
      .insert({ ...reconciliationToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseBankReconciliationRepository.create: ${error.message}`);
    return rowToBankReconciliation(data as ReconciliationRow);
  }
}
