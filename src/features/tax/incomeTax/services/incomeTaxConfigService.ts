import type { ID, IncomeTaxYearConfig } from '@/types';
import type { IIncomeTaxConfigRepository } from '../repositories/IIncomeTaxConfigRepository';

export type CreateIncomeTaxYearConfigDTO = Omit<IncomeTaxYearConfig, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Corporate income tax statutory rate configuration (the flat rate §52 and
 * SBC brackets §53) — SA_ACCOUNTING_MASTER_SPEC.md §51/§52/§53. One record
 * per SARS year of assessment, resolved by effective date. Mirrors
 * PayrollTaxConfigService's "create-only-per-year" pattern exactly rather
 * than TaxRateService's full supersede()-with-audit-trail engine: a SARS
 * statutory table is republished wholesale once a year by SARS itself, not
 * superseded piecemeal by an accountant's own business decision the way a
 * company's VAT code choice can be. See docs/SA_SPEC_GAP_ANALYSIS.md for
 * what this deliberately does NOT do yet (no settings-page UI to add a new
 * year's config without a code change).
 */
export class IncomeTaxConfigService {
  constructor(private readonly repository: IIncomeTaxConfigRepository) {}

  async getAll(): Promise<IncomeTaxYearConfig[]> {
    return this.repository.getAll();
  }

  async getById(id: ID): Promise<IncomeTaxYearConfig | undefined> {
    return this.repository.getById(id);
  }

  /**
   * Whichever tax-year config's [effectiveFrom, effectiveTo] window covers
   * `date`, or undefined if none does. Callers should pass the company's
   * FinancialYear.endDate (the "year of assessment" SARS's rate table is
   * keyed on) — NOT any arbitrary transaction date, and NOT
   * getSarsTaxYear()'s individual/PAYE withholding year (see
   * IncomeTaxYearConfig's doc comment).
   */
  async getConfigForDate(date: Date): Promise<IncomeTaxYearConfig | undefined> {
    const all = await this.repository.getAll();
    const target = date.getTime();
    return all.find((c) => target >= new Date(c.effectiveFrom).getTime() && target <= new Date(c.effectiveTo).getTime());
  }

  async createConfig(data: CreateIncomeTaxYearConfigDTO): Promise<IncomeTaxYearConfig> {
    const now = new Date().toISOString();
    return this.repository.create({ ...data, id: '', createdAt: now, updatedAt: now });
  }
}
