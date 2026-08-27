import { describe, expect, it } from 'vitest';
import { buildDifferenceTimeline } from './timeline';
import type { InvestigationCandidate } from '../types';

function candidate(overrides: Partial<InvestigationCandidate>): InvestigationCandidate {
  return { id: 'c1', side: 'bank', kind: 'bank_transaction', date: '2026-08-14', description: 'Item', amountCents: 16, ...overrides };
}

describe('buildDifferenceTimeline', () => {
  it('identifies the first date the difference appears, mid-period', () => {
    const windowDates = ['2026-08-01', '2026-08-08', '2026-08-13', '2026-08-14', '2026-08-15', '2026-08-27'];
    const contributingItems = [candidate({ id: 'a', date: '2026-08-14', amountCents: 16 })];

    const timeline = buildDifferenceTimeline(windowDates, contributingItems);

    expect(timeline.firstAppearanceDate).toBe('2026-08-14');
    expect(timeline.points.find((p) => p.date === '2026-08-13')!.cumulativeAmount).toBe(0);
    expect(timeline.points.find((p) => p.date === '2026-08-14')!.cumulativeAmount).toBeCloseTo(0.16);
    expect(timeline.points.find((p) => p.date === '2026-08-27')!.cumulativeAmount).toBeCloseTo(0.16);
  });

  it('reports no first-appearance date when nothing contributes', () => {
    const timeline = buildDifferenceTimeline(['2026-08-01', '2026-08-02'], []);
    expect(timeline.firstAppearanceDate).toBeUndefined();
  });
});
