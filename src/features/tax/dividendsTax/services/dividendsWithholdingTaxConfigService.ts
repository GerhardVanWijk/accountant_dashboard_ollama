import type { DividendsWithholdingTaxRateConfig, ID } from '@/types';
import type { IDividendsWithholdingTaxConfigRepository } from '../repositories/IDividendsWithholdingTaxConfigRepository';

export type CreateDividendsWithholdingTaxRateConfigDTO = Omit<DividendsWithholdingTaxRateConfig, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Dividends Withholding Tax rate configuration (SA_ACCOUNTING_MASTER_SPEC.md
 * §56). Mirrors PayrollTaxConfigService's lightweight create-only pattern —
 * see its doc comment for why a full supersede()-with-audit-trail engine
 * (TaxRateService's) is over-built for a statutory rate that changes this
 * rarely (one change since 2017: 15% -> 20%, effective 22 February 2017).
 */
export class DividendsWithholdingTaxConfigService {
  constructor(private readonly repository: IDividendsWithholdingTaxConfigRepository) {}

  async getAll(): Promise<DividendsWithholdingTaxRateConfig[]> {
    return this.repository.getAll();
  }

  async getById(id: ID): Promise<DividendsWithholdingTaxRateConfig | undefined> {
    return this.repository.getById(id);
  }

  /**
   * The rate version in effect on `date` — the newest record whose
   * `effectiveFrom` is on or before `date`. Returns undefined if no
   * version covers that date (e.g. a date before Dividends Tax existed
   * at all, pre-1 April 2012), which callers must treat as "cannot
   * compute withholding here", not silently default to some rate.
   */
  async getRateForDate(date: string): Promise<DividendsWithholdingTaxRateConfig | undefined> {
    const all = await this.repository.getAll();
    const target = new Date(date).getTime();
    const candidates = all.filter((c) => new Date(c.effectiveFrom).getTime() <= target);
    if (candidates.length === 0) return undefined;
    return candidates.reduce((latest, c) => (new Date(c.effectiveFrom).getTime() > new Date(latest.effectiveFrom).getTime() ? c : latest));
  }

  async createConfig(data: CreateDividendsWithholdingTaxRateConfigDTO): Promise<DividendsWithholdingTaxRateConfig> {
    return this.repository.create({ ...data, id: '', createdAt: '', updatedAt: '' });
  }
}
