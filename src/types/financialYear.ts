import type { BaseEntity, ID, ISODateString } from './common';

export type FinancialYearStatus = 'open' | 'closed';

/**
 * A financial year for one company, containing its AccountingPeriods.
 * docs/SA_ACCOUNTING_MASTER_SPEC.md §34/§35. Not the same calendar as the
 * SARS tax year (§59) — that distinction is a Phase 9 (Tax) concern, not
 * modeled here yet.
 */
export interface FinancialYear extends BaseEntity {
  companyId: ID;
  /** e.g. "FY2026". */
  name: string;
  startDate: ISODateString;
  endDate: ISODateString;
  status: FinancialYearStatus;
  closedAt?: ISODateString;
  closedBy?: ID;
}
