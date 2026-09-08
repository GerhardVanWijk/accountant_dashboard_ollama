import { supabase } from '@/config/supabase';

/** Read-only summary row over the EXISTING `bank_statements` table (migration 0020) — Requirement 5: "reuse existing statement parser/persistence," never a second bank engine. */
export interface BankStatementSummary {
  id: string;
  bankAccountId: string;
  sourceFilename?: string;
  periodStart: string;
  periodEnd: string;
  openingBalance: number;
  closingBalance: number;
  lineCount: number;
  /** Calculated from opening balance + every imported movement — the existing `computeBalanceCheck()` result, persisted at import time as `balance_check_ok`. */
  balanceCheckOk?: boolean;
  reconciliationStatus: string;
  importStatus: string;
}

/** Every migrated bank statement for the active company, most recent first — surfaces the SAME validation `StatementImportService`/`computeBalanceCheck()` already computed at import time (Requirement 5), nothing recalculated here. */
export async function listBankStatementSummaries(): Promise<BankStatementSummary[]> {
  const { data, error } = await supabase
    .from('bank_statements')
    .select('id, bank_account_id, source_filename, period_start, period_end, opening_balance, closing_balance, line_count, balance_check_ok, reconciliation_status, import_status')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    bankAccountId: row.bank_account_id as string,
    sourceFilename: (row.source_filename as string | null) ?? undefined,
    periodStart: row.period_start as string,
    periodEnd: row.period_end as string,
    openingBalance: Number(row.opening_balance),
    closingBalance: Number(row.closing_balance),
    lineCount: row.line_count as number,
    balanceCheckOk: (row.balance_check_ok as boolean | null) ?? undefined,
    reconciliationStatus: row.reconciliation_status as string,
    importStatus: row.import_status as string,
  }));
}
