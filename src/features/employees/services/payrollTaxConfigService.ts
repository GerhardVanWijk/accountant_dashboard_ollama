import type { ID, PayrollTaxYearConfig } from '@/types';
import type { IPayrollTaxConfigRepository } from '../repositories/IPayrollTaxConfigRepository';

export type CreatePayrollTaxYearConfigDTO = Omit<PayrollTaxYearConfig, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Payroll statutory rate configuration (PAYE brackets/rebates, UIF, SDL —
 * SA_ACCOUNTING_MASTER_SPEC.md §58/§59/§82/§113). One record per SARS tax
 * year, resolved by effective date — a lighter-weight sibling of
 * TaxRateService's full supersede()-with-audit-trail engine: a SARS
 * statutory table is republished wholesale once a year by SARS itself,
 * not superseded piecemeal by an accountant's own business decision the
 * way a company's VAT code choice can be, so a straightforward "create the
 * next tax year's config" is the honest scope here rather than
 * over-building versioning machinery a once-a-year government table
 * doesn't need. See docs/SA_SPEC_GAP_ANALYSIS.md for what this
 * deliberately does NOT do yet (no settings-page UI to add a new tax
 * year's config without a code change).
 */
export class PayrollTaxConfigService {
  constructor(private readonly repository: IPayrollTaxConfigRepository) {}

  async getAll(): Promise<PayrollTaxYearConfig[]> {
    return this.repository.getAll();
  }

  async getById(id: ID): Promise<PayrollTaxYearConfig | undefined> {
    return this.repository.getById(id);
  }

  /** Whichever tax-year config's [taxYearStart, taxYearEnd] window covers `date`, or undefined if none does. */
  async getConfigForDate(date: Date): Promise<PayrollTaxYearConfig | undefined> {
    const all = await this.repository.getAll();
    const iso = date.toISOString();
    return all.find((c) => c.taxYearStart <= iso && iso <= c.taxYearEnd);
  }

  async createConfig(data: CreatePayrollTaxYearConfigDTO): Promise<PayrollTaxYearConfig> {
    const now = new Date().toISOString();
    return this.repository.create({ ...data, id: '', createdAt: now, updatedAt: now });
  }
}
