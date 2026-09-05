import type { BaseEntity, ID } from './common';

/**
 * Forecasting (docs/CURRENT_TASKS.md § "NEXT" — previously entirely
 * absent). Two plan types, deliberately not a full versioning history
 * (migration 0060's own scope note): `budget` is the fixed annual plan;
 * `forecast` is the CURRENT (single, overwritable) re-forecast — there is
 * no named-scenario or snapshot history in this pass.
 */
export type FinancialPlanType = 'budget' | 'forecast';

/**
 * One planned amount for one GL account in one calendar month. Never posts
 * to the ledger — "Actual" is computed separately, live, from
 * `journal_lines`/`journal_entries` (the same source every other financial
 * report reads), never duplicated into this table.
 */
export interface FinancialPlanLine extends BaseEntity {
  planType: FinancialPlanType;
  accountId: ID;
  /** Calendar year, e.g. 2026. */
  periodYear: number;
  /** 1-12. */
  periodMonth: number;
  /**
   * Expressed in the account's own NORMAL direction — a positive number
   * always means "more of what this account normally accumulates" (more
   * revenue, more expense, more asset), matching `computeActualByAccountMonth`'s
   * sign convention so Budget/Forecast/Actual are directly comparable
   * without a sign flip in the UI.
   */
  amount: number;
  notes?: string;
}
