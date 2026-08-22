import { describe, it, expect, beforeEach } from 'vitest';
import { CgtConfigService } from './cgtConfigService';
import { MockCgtInclusionRateConfigRepository } from '../repositories/MockCgtInclusionRateConfigRepository';
import { MockCgtAnnualExclusionConfigRepository } from '../repositories/MockCgtAnnualExclusionConfigRepository';
import type { CgtAnnualExclusionConfig, CgtInclusionRateConfig } from '@/types';

const OLD_YEAR_RATE: CgtInclusionRateConfig = {
  id: 'cgt_incl_natural_old',
  entityTypeBucket: 'natural_person_like',
  inclusionRatePercent: 33.3,
  effectiveFrom: '2025-03-01T00:00:00.000Z',
  effectiveTo: '2026-02-28T23:59:59.999Z',
  sourceReference: 'old year (hypothetical, for test only)',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const CURRENT_YEAR_RATE: CgtInclusionRateConfig = {
  id: 'cgt_incl_natural_current',
  entityTypeBucket: 'natural_person_like',
  inclusionRatePercent: 40,
  effectiveFrom: '2026-03-01T00:00:00.000Z',
  effectiveTo: '2027-02-28T23:59:59.999Z',
  sourceReference: 'current year',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const COMPANY_RATE: CgtInclusionRateConfig = { ...CURRENT_YEAR_RATE, id: 'cgt_incl_company', entityTypeBucket: 'company', inclusionRatePercent: 80 };

const EXCLUSION: CgtAnnualExclusionConfig = {
  id: 'cgt_excl_current',
  amount: 50000,
  effectiveFrom: '2026-03-01T00:00:00.000Z',
  effectiveTo: '2027-02-28T23:59:59.999Z',
  sourceReference: 'current year',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('CgtConfigService', () => {
  let service: CgtConfigService;

  beforeEach(() => {
    const inclusionRateRepository = new MockCgtInclusionRateConfigRepository([OLD_YEAR_RATE, CURRENT_YEAR_RATE, COMPANY_RATE]);
    const annualExclusionRepository = new MockCgtAnnualExclusionConfigRepository([EXCLUSION]);
    service = new CgtConfigService(inclusionRateRepository, annualExclusionRepository);
  });

  it('resolves the inclusion rate config whose effective window covers the given date, for the given bucket', async () => {
    const resolved = await service.getInclusionRateConfig('natural_person_like', new Date('2026-08-22T00:00:00.000Z'));
    expect(resolved?.id).toBe('cgt_incl_natural_current');
    expect(resolved?.inclusionRatePercent).toBe(40);
  });

  it('resolves an earlier config for a date in an earlier effective window', async () => {
    const resolved = await service.getInclusionRateConfig('natural_person_like', new Date('2025-12-01T00:00:00.000Z'));
    expect(resolved?.id).toBe('cgt_incl_natural_old');
    expect(resolved?.inclusionRatePercent).toBe(33.3);
  });

  it('returns undefined when no config covers the date for that bucket, rather than fabricating one', async () => {
    const resolved = await service.getInclusionRateConfig('natural_person_like', new Date('2030-01-01T00:00:00.000Z'));
    expect(resolved).toBeUndefined();
  });

  it('never returns a different bucket\'s config even when its effective window covers the date', async () => {
    const resolved = await service.getInclusionRateConfig('trust', new Date('2026-08-22T00:00:00.000Z'));
    expect(resolved).toBeUndefined();
  });

  it('keeps buckets independent — company and natural_person_like both resolve for the same date', async () => {
    const natural = await service.getInclusionRateConfig('natural_person_like', new Date('2026-08-22T00:00:00.000Z'));
    const company = await service.getInclusionRateConfig('company', new Date('2026-08-22T00:00:00.000Z'));
    expect(natural?.inclusionRatePercent).toBe(40);
    expect(company?.inclusionRatePercent).toBe(80);
  });

  it('resolves the annual exclusion config covering the given date', async () => {
    const resolved = await service.getAnnualExclusionConfig(new Date('2026-08-22T00:00:00.000Z'));
    expect(resolved?.amount).toBe(50000);
  });

  it('returns undefined for the annual exclusion when the date falls outside every configured window', async () => {
    const resolved = await service.getAnnualExclusionConfig(new Date('2030-01-01T00:00:00.000Z'));
    expect(resolved).toBeUndefined();
  });

  it('creates a new inclusion rate config that is then resolvable', async () => {
    const created = await service.createInclusionRateConfig({
      entityTypeBucket: 'trust',
      inclusionRatePercent: 80,
      effectiveFrom: '2026-03-01T00:00:00.000Z',
      effectiveTo: '2027-02-28T23:59:59.999Z',
      sourceReference: 'test',
    });
    expect(created.id).toBeTruthy();

    const resolved = await service.getInclusionRateConfig('trust', new Date('2026-08-22T00:00:00.000Z'));
    expect(resolved?.id).toBe(created.id);
  });

  it('creates a new annual exclusion config that is then resolvable', async () => {
    const created = await service.createAnnualExclusionConfig({
      amount: 55000,
      effectiveFrom: '2027-03-01T00:00:00.000Z',
      sourceReference: 'test next year',
    });

    const resolved = await service.getAnnualExclusionConfig(new Date('2027-06-01T00:00:00.000Z'));
    expect(resolved?.id).toBe(created.id);
    expect(resolved?.amount).toBe(55000);
  });
});
