import { describe, expect, it } from 'vitest';
import type { ReportingStandardVersion } from '@/types';
import { resolveApplicableVersion } from './reportingStandardCalculations';

function version(overrides: Partial<ReportingStandardVersion> & Pick<ReportingStandardVersion, 'id' | 'effectiveFrom'>): ReportingStandardVersion {
  return {
    standard: 'ifrs_for_smes',
    versionLabel: 'Test edition',
    earlyAdoptionPermitted: false,
    sourceReference: 'test',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('resolveApplicableVersion', () => {
  const smes2015 = version({ id: 'v2015', effectiveFrom: '2015-01-01T00:00:00.000Z' });
  const smes2025 = version({ id: 'v2025', effectiveFrom: '2027-01-01T00:00:00.000Z', earlyAdoptionPermitted: true });
  const history = [smes2015, smes2025];

  it('resolves the newest version whose effectiveFrom is on/before the period start', () => {
    expect(resolveApplicableVersion(history, new Date('2026-01-01'))?.id).toBe('v2015');
    expect(resolveApplicableVersion(history, new Date('2027-06-01'))?.id).toBe('v2025');
  });

  it('does not early-adopt a later version unless explicitly elected', () => {
    expect(resolveApplicableVersion(history, new Date('2026-06-01'), false)?.id).toBe('v2015');
  });

  it('early-adopts a later version only when it permits early adoption and is elected', () => {
    expect(resolveApplicableVersion(history, new Date('2026-06-01'), true)?.id).toBe('v2025');
  });

  it('does not early-adopt a version that does not permit it', () => {
    const noEarlyAdoption = [smes2015, version({ id: 'v2030', effectiveFrom: '2030-01-01T00:00:00.000Z', earlyAdoptionPermitted: false })];
    expect(resolveApplicableVersion(noEarlyAdoption, new Date('2026-06-01'), true)?.id).toBe('v2015');
  });

  it('returns undefined when nothing qualifies', () => {
    expect(resolveApplicableVersion([smes2025], new Date('2020-01-01'))).toBeUndefined();
  });
});
