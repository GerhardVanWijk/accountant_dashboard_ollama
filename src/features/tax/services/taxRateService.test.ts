import { describe, it, expect, beforeEach } from 'vitest';
import { TaxRateService } from './taxRateService';
import { MockTaxRateRepository } from '@/repositories/mock/MockTaxRateRepository';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import type { TaxRate } from '@/types';

type NewTaxRate = Omit<TaxRate, 'id' | 'createdAt' | 'updatedAt'>;

function makeRate(overrides: Partial<NewTaxRate> = {}): NewTaxRate {
  return {
    code: 'STD',
    name: 'Standard Rate (15%)',
    treatment: 'standard_rated',
    rate: 15,
    appliesTo: 'both',
    effectiveFrom: '2018-04-01T00:00:00.000Z',
    jurisdiction: 'ZA',
    sourceReference: 'test fixture',
    isActive: true,
    ...overrides,
  };
}

describe('TaxRateService', () => {
  let service: TaxRateService;
  let auditLog: AuditLogService;

  beforeEach(() => {
    auditLog = new AuditLogService(new MockAuditLogRepository());
    service = new TaxRateService(new MockTaxRateRepository([]), auditLog);
  });

  describe('getEffectiveRate', () => {
    it('resolves the version in effect on a given historical date', async () => {
      const v1 = await service.createTaxRate(
        makeRate({ rate: 14, effectiveFrom: '2010-01-01T00:00:00.000Z', effectiveTo: '2018-03-31T00:00:00.000Z' }),
      );
      const v2 = await service.createTaxRate(makeRate({ rate: 15, effectiveFrom: '2018-04-01T00:00:00.000Z' }));

      const before = await service.getEffectiveRate('STD', new Date('2015-06-01'));
      const after = await service.getEffectiveRate('STD', new Date('2026-01-01'));

      expect(before?.id).toBe(v1.id);
      expect(before?.rate).toBe(14);
      expect(after?.id).toBe(v2.id);
      expect(after?.rate).toBe(15);
    });

    it('returns undefined when no version of the code covers that date', async () => {
      await service.createTaxRate(makeRate({ rate: 15, effectiveFrom: '2018-04-01T00:00:00.000Z' }));
      const result = await service.getEffectiveRate('STD', new Date('2010-01-01'));
      expect(result).toBeUndefined();
    });
  });

  describe('getCurrentRate', () => {
    it('returns the currently open-ended version', async () => {
      await service.createTaxRate(
        makeRate({ rate: 14, effectiveFrom: '2010-01-01T00:00:00.000Z', effectiveTo: '2018-03-31T00:00:00.000Z' }),
      );
      const v2 = await service.createTaxRate(makeRate({ rate: 15, effectiveFrom: '2018-04-01T00:00:00.000Z' }));

      const current = await service.getCurrentRate('STD');
      expect(current?.id).toBe(v2.id);
    });
  });

  describe('supersede', () => {
    it('closes the previously open-ended version and creates a new one, never editing the old rate in place', async () => {
      const original = await service.createTaxRate(makeRate({ rate: 14, effectiveFrom: '2010-01-01T00:00:00.000Z' }));

      const superseded = await service.supersede(
        'STD',
        {
          rate: 15,
          effectiveFrom: '2018-04-01T00:00:00.000Z',
          sourceReference: 'VAT Act amendment (test)',
          treatment: 'standard_rated',
          appliesTo: 'both',
          jurisdiction: 'ZA',
          name: 'Standard Rate (15%)',
        },
        'user_1',
        'Rate increased per legislation',
      );

      expect(superseded.rate).toBe(15);
      expect(superseded.effectiveFrom).toBe('2018-04-01T00:00:00.000Z');
      expect(superseded.effectiveTo).toBeUndefined();

      const history = await service.getRateHistory('STD');
      expect(history).toHaveLength(2);
      const closedOriginal = history.find((r) => r.id === original.id);
      expect(closedOriginal?.rate).toBe(14); // original rate untouched, never edited in place
      expect(closedOriginal?.effectiveTo).toBe('2018-03-31T00:00:00.000Z');
    });

    it('requires a reason', async () => {
      await service.createTaxRate(makeRate({ effectiveFrom: '2010-01-01T00:00:00.000Z' }));
      await expect(
        service.supersede(
          'STD',
          {
            rate: 15,
            effectiveFrom: '2018-04-01T00:00:00.000Z',
            sourceReference: 'x',
            treatment: 'standard_rated',
            appliesTo: 'both',
            jurisdiction: 'ZA',
            name: 'Standard Rate (15%)',
          },
          'user_1',
          '',
        ),
      ).rejects.toThrow(/reason/i);
    });

    it('writes an audit log entry', async () => {
      await service.createTaxRate(makeRate({ effectiveFrom: '2010-01-01T00:00:00.000Z' }));
      await service.supersede(
        'STD',
        {
          rate: 15,
          effectiveFrom: '2018-04-01T00:00:00.000Z',
          sourceReference: 'x',
          treatment: 'standard_rated',
          appliesTo: 'both',
          jurisdiction: 'ZA',
          name: 'Standard Rate (15%)',
        },
        'user_1',
        'Rate change',
      );

      const entries = await auditLog.getAll();
      expect(entries.some((e) => e.action === 'tax_rate_superseded')).toBe(true);
    });

    it('rejects a new effectiveFrom that is not after the currently open version', async () => {
      await service.createTaxRate(makeRate({ effectiveFrom: '2018-04-01T00:00:00.000Z' }));
      await expect(
        service.supersede(
          'STD',
          {
            rate: 15,
            effectiveFrom: '2018-04-01T00:00:00.000Z',
            sourceReference: 'x',
            treatment: 'standard_rated',
            appliesTo: 'both',
            jurisdiction: 'ZA',
            name: 'Standard Rate (15%)',
          },
          'user_1',
          'Bad date',
        ),
      ).rejects.toThrow(/not after/i);
    });
  });

  describe('getCurrentlyEffectiveRates', () => {
    it('offers only one entry per code, not every historical version', async () => {
      await service.createTaxRate(
        makeRate({ code: 'STD', rate: 14, effectiveFrom: '2010-01-01T00:00:00.000Z', effectiveTo: '2018-03-31T00:00:00.000Z' }),
      );
      const v2 = await service.createTaxRate(makeRate({ code: 'STD', rate: 15, effectiveFrom: '2018-04-01T00:00:00.000Z' }));
      await service.createTaxRate(
        makeRate({ code: 'ZERO', rate: 0, treatment: 'zero_rated', effectiveFrom: '2010-01-01T00:00:00.000Z' }),
      );

      const rates = await service.getCurrentlyEffectiveRates(new Date('2026-01-01'));
      const codes = rates.map((r) => r.code).sort();
      expect(codes).toEqual(['STD', 'ZERO']);
      expect(rates.find((r) => r.code === 'STD')?.id).toBe(v2.id);
    });
  });
});
