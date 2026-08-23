import { describe, expect, it } from 'vitest';
import type { EclBucketLine, EclComputation } from '@/types';
import type { AgingReportRow } from '@/features/reports/aging/types';
import {
  aggregateReceivablesByBucket,
  buildEclBucketLines,
  calculateBucketExpectedCreditLoss,
  calculateEclTotals,
  findMostRecentPostedEclBefore,
  recalculateBucketLine,
} from './eclCalculations';

function bucket(overrides: Partial<EclBucketLine> & Pick<EclBucketLine, 'bucket'>): EclBucketLine {
  return { grossReceivable: 0, lossRatePercent: 0, expectedCreditLoss: 0, ...overrides };
}

describe('aggregateReceivablesByBucket', () => {
  it('sums every customer row into one fleet-wide total per bucket', () => {
    const rows: AgingReportRow[] = [
      { id: 'c1', name: 'Alpha', buckets: { current: 100, days30: 50, days60: 0, days90Plus: 0, total: 150 } },
      { id: 'c2', name: 'Beta', buckets: { current: 0, days30: 20, days60: 30, days90Plus: 10, total: 60 } },
    ];
    expect(aggregateReceivablesByBucket(rows)).toEqual({ current: 100, days30: 70, days60: 30, days90Plus: 10 });
  });

  it('returns all-zero totals for an empty report', () => {
    expect(aggregateReceivablesByBucket([])).toEqual({ current: 0, days30: 0, days60: 0, days90Plus: 0 });
  });
});

describe('calculateBucketExpectedCreditLoss', () => {
  it('applies the loss rate to the gross receivable', () => {
    expect(calculateBucketExpectedCreditLoss(10000, 2.5)).toBe(250);
  });
  it('is zero at a 0% rate', () => {
    expect(calculateBucketExpectedCreditLoss(10000, 0)).toBe(0);
  });
});

describe('recalculateBucketLine', () => {
  it('re-derives expectedCreditLoss from grossReceivable/lossRatePercent', () => {
    const result = recalculateBucketLine(bucket({ bucket: 'days60', grossReceivable: 5000, lossRatePercent: 10, expectedCreditLoss: 0 }));
    expect(result.expectedCreditLoss).toBe(500);
  });
});

describe('buildEclBucketLines', () => {
  it('builds all four buckets at 0% when there is no prior computation', () => {
    const lines = buildEclBucketLines({ current: 1000, days30: 2000, days60: 3000, days90Plus: 4000 });
    expect(lines).toHaveLength(4);
    expect(lines.map((l) => l.bucket)).toEqual(['current', 'days30', 'days60', 'days90Plus']);
    expect(lines.every((l) => l.lossRatePercent === 0)).toBe(true);
    expect(lines.every((l) => l.expectedCreditLoss === 0)).toBe(true);
  });

  it('carries forward the prior computation loss rate per bucket, applied to the NEW gross receivable', () => {
    const priorBuckets: EclBucketLine[] = [
      bucket({ bucket: 'current', lossRatePercent: 1 }),
      bucket({ bucket: 'days30', lossRatePercent: 5 }),
      bucket({ bucket: 'days60', lossRatePercent: 20 }),
      bucket({ bucket: 'days90Plus', lossRatePercent: 50 }),
    ];
    const lines = buildEclBucketLines({ current: 10000, days30: 10000, days60: 10000, days90Plus: 10000 }, priorBuckets);
    expect(lines.find((l) => l.bucket === 'days90Plus')?.lossRatePercent).toBe(50);
    expect(lines.find((l) => l.bucket === 'days90Plus')?.expectedCreditLoss).toBe(5000);
  });
});

describe('calculateEclTotals', () => {
  it('sums gross receivable and expected credit loss across every bucket', () => {
    const buckets: EclBucketLine[] = [
      bucket({ bucket: 'current', grossReceivable: 1000, expectedCreditLoss: 10 }),
      bucket({ bucket: 'days30', grossReceivable: 2000, expectedCreditLoss: 100 }),
    ];
    expect(calculateEclTotals(buckets)).toEqual({ totalGrossReceivable: 3000, totalExpectedCreditLoss: 110 });
  });
});

describe('findMostRecentPostedEclBefore', () => {
  function computation(overrides: Partial<EclComputation>): EclComputation {
    return {
      id: 'c1',
      companyId: 'comp_1',
      financialYearId: 'fy1',
      financialYearLabel: 'FY',
      asOfDate: '2026-12-31',
      status: 'posted',
      buckets: [],
      totalGrossReceivable: 0,
      totalExpectedCreditLoss: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  it('finds the most recent posted computation strictly before the given date, for the right company', () => {
    const older = computation({ id: 'c_old', asOfDate: '2025-12-31' });
    const newer = computation({ id: 'c_new', asOfDate: '2026-12-31' });
    const draft = computation({ id: 'c_draft', asOfDate: '2026-06-30', status: 'draft' });
    const otherCompany = computation({ id: 'c_other', asOfDate: '2026-06-30', companyId: 'comp_2' });

    expect(findMostRecentPostedEclBefore([older, newer, draft, otherCompany], 'comp_1', '2027-12-31')?.id).toBe('c_new');
  });

  it('returns undefined when nothing qualifies', () => {
    const onBoundary = computation({ id: 'c_boundary', asOfDate: '2026-12-31' });
    expect(findMostRecentPostedEclBefore([onBoundary], 'comp_1', '2026-12-31')).toBeUndefined();
  });
});
