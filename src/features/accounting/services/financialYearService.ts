import type { FinancialYear, ID } from '@/types';
import type { IFinancialYearRepository } from '../repositories/IFinancialYearRepository';
import type { AuditLogService } from '@/services/auditLogService';

/**
 * Minimal financial-year lifecycle. Closing a year is a distinct, audited
 * event from closing an individual AccountingPeriod (docs/
 * SA_ACCOUNTING_MASTER_SPEC.md §34's year-end checklist — bank/debtors/
 * creditors/inventory/VAT/payroll/fixed-asset/loan/tax reconciliation,
 * adjusting journals, retained-earnings roll-forward — is NOT implemented
 * here; this only flips the year's own status and logs it).
 */
export class FinancialYearService {
  constructor(
    private readonly repository: IFinancialYearRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  async getFinancialYears(): Promise<FinancialYear[]> {
    return this.repository.getAll();
  }

  async getFinancialYear(id: ID): Promise<FinancialYear | undefined> {
    return this.repository.getById(id);
  }

  async closeFinancialYear(id: ID, userId: ID): Promise<FinancialYear> {
    const year = await this.repository.getById(id);
    if (!year) {
      throw new Error(`Financial year "${id}" not found.`);
    }
    if (year.status === 'closed') {
      throw new Error(`Financial year "${id}" is already closed.`);
    }
    const now = new Date().toISOString();
    const updated = await this.repository.update(id, { status: 'closed', closedAt: now, closedBy: userId });

    await this.auditLog.log({
      userId,
      action: 'financial_year_closed',
      module: 'accounting',
      recordType: 'FinancialYear',
      recordId: id,
      previousValue: { status: 'open' },
      newValue: { status: 'closed' },
    });

    return updated;
  }
}
