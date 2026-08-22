import type { CgtAnnualExclusionConfig, CgtEntityTypeBucket, CgtInclusionRateConfig } from '@/types';
import type { ICgtInclusionRateConfigRepository } from '../repositories/ICgtInclusionRateConfigRepository';
import type { ICgtAnnualExclusionConfigRepository } from '../repositories/ICgtAnnualExclusionConfigRepository';

export type CreateCgtInclusionRateConfigDTO = Omit<CgtInclusionRateConfig, 'id' | 'createdAt' | 'updatedAt'>;
export type CreateCgtAnnualExclusionConfigDTO = Omit<CgtAnnualExclusionConfig, 'id' | 'createdAt' | 'updatedAt'>;

function covers(effectiveFrom: string, effectiveTo: string | undefined, iso: string): boolean {
  return effectiveFrom <= iso && (effectiveTo === undefined || iso <= effectiveTo);
}

/**
 * CGT statutory configuration (SA_ACCOUNTING_MASTER_SPEC.md §55) — inclusion
 * rates per entity-type bucket, and the natural-person annual exclusion.
 * Same lightweight "create the next tax year's config, resolve by
 * effective date" pattern as PayrollTaxConfigService
 * (src/features/employees/services/payrollTaxConfigService.ts): a SARS
 * statutory figure is republished wholesale by SARS itself, not
 * superseded piecemeal by an accountant's own business decision, so this
 * deliberately does not build TaxRateService's full supersede()-with-
 * audit-trail engine.
 */
export class CgtConfigService {
  constructor(
    private readonly inclusionRateRepository: ICgtInclusionRateConfigRepository,
    private readonly annualExclusionRepository: ICgtAnnualExclusionConfigRepository,
  ) {}

  async getAllInclusionRateConfigs(): Promise<CgtInclusionRateConfig[]> {
    return this.inclusionRateRepository.getAll();
  }

  async getAllAnnualExclusionConfigs(): Promise<CgtAnnualExclusionConfig[]> {
    return this.annualExclusionRepository.getAll();
  }

  /** Whichever config for `bucket` covers `date`, or undefined if none does. */
  async getInclusionRateConfig(bucket: CgtEntityTypeBucket, date: Date): Promise<CgtInclusionRateConfig | undefined> {
    const all = await this.inclusionRateRepository.getAll();
    const iso = date.toISOString();
    return all.find((c) => c.entityTypeBucket === bucket && covers(c.effectiveFrom, c.effectiveTo, iso));
  }

  /** Whichever annual-exclusion config covers `date`, or undefined if none does. */
  async getAnnualExclusionConfig(date: Date): Promise<CgtAnnualExclusionConfig | undefined> {
    const all = await this.annualExclusionRepository.getAll();
    const iso = date.toISOString();
    return all.find((c) => covers(c.effectiveFrom, c.effectiveTo, iso));
  }

  async createInclusionRateConfig(data: CreateCgtInclusionRateConfigDTO): Promise<CgtInclusionRateConfig> {
    const now = new Date().toISOString();
    return this.inclusionRateRepository.create({ ...data, id: '', createdAt: now, updatedAt: now });
  }

  async createAnnualExclusionConfig(data: CreateCgtAnnualExclusionConfigDTO): Promise<CgtAnnualExclusionConfig> {
    const now = new Date().toISOString();
    return this.annualExclusionRepository.create({ ...data, id: '', createdAt: now, updatedAt: now });
  }
}
