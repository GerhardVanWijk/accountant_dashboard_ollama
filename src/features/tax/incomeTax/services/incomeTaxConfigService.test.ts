import { describe, it, expect, beforeEach } from 'vitest';
import { IncomeTaxConfigService } from './incomeTaxConfigService';
import { MockIncomeTaxConfigRepository } from '../repositories/MockIncomeTaxConfigRepository';
import { seedIncomeTaxConfig } from '@/mock-data/corporateTaxConfig';

describe('IncomeTaxConfigService', () => {
  let repository: MockIncomeTaxConfigRepository;
  let service: IncomeTaxConfigService;

  beforeEach(() => {
    repository = new MockIncomeTaxConfigRepository();
    service = new IncomeTaxConfigService(repository);
  });

  it('resolves the config whose effective window covers a given date', async () => {
    const config = await service.getConfigForDate(new Date('2026-12-31T23:59:59.999Z'));
    expect(config?.id).toBe('itc_2026_2027');
  });

  it('resolves inclusively at the exact effectiveFrom/effectiveTo boundaries', async () => {
    const atStart = await service.getConfigForDate(new Date('2026-04-01T00:00:00.000Z'));
    const atEnd = await service.getConfigForDate(new Date('2027-03-31T23:59:59.999Z'));
    expect(atStart?.id).toBe('itc_2026_2027');
    expect(atEnd?.id).toBe('itc_2026_2027');
  });

  it('returns undefined for a date outside every configured window', async () => {
    const config = await service.getConfigForDate(new Date('2020-01-01T00:00:00.000Z'));
    expect(config).toBeUndefined();
  });

  it('creates a new year-of-assessment config, resolvable afterwards', async () => {
    const created = await service.createConfig({
      taxYearLabel: '2027/2028',
      effectiveFrom: '2027-04-01T00:00:00.000Z',
      effectiveTo: '2028-03-31T23:59:59.999Z',
      corporateTaxRatePercent: 27,
      sbcBrackets: seedIncomeTaxConfig[0].sbcBrackets,
      sourceReference: 'test',
    });
    expect(created.id).toBeTruthy();

    const resolved = await service.getConfigForDate(new Date('2027-06-01T00:00:00.000Z'));
    expect(resolved?.id).toBe(created.id);
  });

  it('getById returns the seeded config by id', async () => {
    const config = await service.getById('itc_2026_2027');
    expect(config?.taxYearLabel).toBe('2026/2027');
  });
});
