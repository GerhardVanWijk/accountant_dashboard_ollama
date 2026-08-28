import { describe, it, expect } from 'vitest';
import { computeReconciliationHealth } from './reconciliationHealthService';

describe('computeReconciliationHealth (docs/CURRENT_TASKS.md #22)', () => {
  it('never reports "explained" as complete while a money variance remains — the reported bug', () => {
    // The screenshot state: nothing imported, but statement vs books is out by R74,905.
    const health = computeReconciliationHealth(0, 0, 0, 0, 74905, 0);

    expect(health.matchCoveragePercent).toBeNull(); // NOT 100%
    expect(health.varianceExplainedPercent).toBe(0);
    expect(health.varianceRemaining).toBe(74905);
  });

  it('separates transaction match coverage from variance explained', () => {
    // 32 analysed, 27 matched (22 + 5), R100 gap with R87 of candidate causes.
    const health = computeReconciliationHealth(32, 22, 5, 3, 100, 87);

    expect(health.matchCoveragePercent).toBeCloseTo(84.4, 1); // 27/32
    expect(health.varianceExplained).toBe(87);
    expect(health.varianceRemaining).toBe(13);
    expect(health.varianceExplainedPercent).toBe(87);
  });

  it('caps varianceExplained at |variance| so overlapping candidate causes cannot exceed 100%', () => {
    const health = computeReconciliationHealth(10, 8, 1, 0, 16.73, 40); // detectors over-explain
    expect(health.varianceExplained).toBe(16.73);
    expect(health.varianceRemaining).toBe(0);
    expect(health.varianceExplainedPercent).toBe(100);
  });

  it('reports 100% variance-explained only when the gap is genuinely zero', () => {
    const health = computeReconciliationHealth(12, 12, 0, 0, 0, 0);
    expect(health.varianceExplainedPercent).toBe(100);
    expect(health.varianceRemaining).toBe(0);
    expect(health.matchCoveragePercent).toBe(100);
  });

  it('works with a negative (refund-direction) variance', () => {
    const health = computeReconciliationHealth(5, 3, 0, 0, -250, 100);
    expect(health.varianceExplained).toBe(100);
    expect(health.varianceRemaining).toBe(150);
    expect(health.varianceExplainedPercent).toBe(40);
  });
});
