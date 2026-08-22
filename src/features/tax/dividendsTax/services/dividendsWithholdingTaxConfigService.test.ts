import { describe, it, expect, beforeEach } from 'vitest';
import { DividendsWithholdingTaxConfigService } from './dividendsWithholdingTaxConfigService';
import { MockDividendsWithholdingTaxConfigRepository } from '../repositories/MockDividendsWithholdingTaxConfigRepository';
import { seedDividendsWithholdingTaxConfig } from '@/mock-data/dividendsTaxConfig';

describe('DividendsWithholdingTaxConfigService.getRateForDate', () => {
  let service: DividendsWithholdingTaxConfigService;

  beforeEach(() => {
    const repository = new MockDividendsWithholdingTaxConfigRepository(seedDividendsWithholdingTaxConfig);
    service = new DividendsWithholdingTaxConfigService(repository);
  });

  it('resolves the seeded 20% rate for a date well after 2017-02-22', async () => {
    const rate = await service.getRateForDate('2026-06-15');
    expect(rate?.ratePercent).toBe(20);
  });

  it('resolves the seeded 20% rate on its exact effective date', async () => {
    const rate = await service.getRateForDate('2017-02-22');
    expect(rate?.ratePercent).toBe(20);
  });

  it('returns undefined for a date before any configured rate existed', async () => {
    const rate = await service.getRateForDate('2010-01-01');
    expect(rate).toBeUndefined();
  });

  it('resolves the newest applicable rate when multiple versions exist', async () => {
    const repository = new MockDividendsWithholdingTaxConfigRepository(seedDividendsWithholdingTaxConfig);
    const multiVersionService = new DividendsWithholdingTaxConfigService(repository);

    await repository.create({
      id: '',
      ratePercent: 25,
      effectiveFrom: '2030-01-01T00:00:00.000Z',
      sourceReference: 'Hypothetical future rate change for this test only.',
      createdAt: '',
      updatedAt: '',
    });

    expect((await multiVersionService.getRateForDate('2026-06-15'))?.ratePercent).toBe(20);
    expect((await multiVersionService.getRateForDate('2030-06-15'))?.ratePercent).toBe(25);
  });

  it('createConfig adds a new rate version retrievable via getAll', async () => {
    const created = await service.createConfig({
      ratePercent: 22,
      effectiveFrom: '2031-01-01T00:00:00.000Z',
      sourceReference: 'Test-only hypothetical rate.',
    });
    expect(created.id).toBeTruthy();
    const all = await service.getAll();
    expect(all).toHaveLength(seedDividendsWithholdingTaxConfig.length + 1);
  });
});
