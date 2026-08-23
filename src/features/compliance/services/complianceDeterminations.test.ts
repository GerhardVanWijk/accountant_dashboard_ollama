import { describe, expect, it } from 'vitest';
import { calculatePublicInterestScorePoints, determineAssuranceLevel, determineReportingFramework } from './complianceDeterminations';

describe('calculatePublicInterestScorePoints', () => {
  it('rounds each Rand-value band up ("or a portion thereof")', () => {
    const points = calculatePublicInterestScorePoints(4.5, 1_000_001, 2_000_000, 3);
    expect(points.employeePoints).toBe(5); // ceil(4.5)
    expect(points.turnoverPoints).toBe(2); // R1,000,001 -> 2 points, not 1
    expect(points.thirdPartyLiabilityPoints).toBe(2); // exactly R2m -> 2 points
    expect(points.shareholderPoints).toBe(3);
    expect(points.totalScore).toBe(5 + 2 + 2 + 3);
  });

  it('never returns negative points for a zero/negative input', () => {
    const points = calculatePublicInterestScorePoints(0, 0, 0, 0);
    expect(points).toEqual({ employeePoints: 0, turnoverPoints: 0, thirdPartyLiabilityPoints: 0, shareholderPoints: 0, totalScore: 0 });
  });
});

describe('determineAssuranceLevel', () => {
  it('requires audit for a public/state-owned company regardless of score', () => {
    const result = determineAssuranceLevel(5, false, undefined, true);
    expect(result.level).toBe('audit_required');
  });

  it('requires audit when fiduciary assets exceed R5 million regardless of score', () => {
    const result = determineAssuranceLevel(5, true, undefined, false);
    expect(result.level).toBe('audit_required');
  });

  it('requires audit at 350+ regardless of compilation method', () => {
    expect(determineAssuranceLevel(350, false, 'independent', false).level).toBe('audit_required');
    expect(determineAssuranceLevel(500, false, undefined, false).level).toBe('audit_required');
  });

  it('requires audit only for internally-compiled statements in the 100-349 band', () => {
    expect(determineAssuranceLevel(200, false, 'internal', false).level).toBe('audit_required');
    expect(determineAssuranceLevel(200, false, 'independent', false).level).toBe('independent_review_required');
  });

  it('defaults to the stricter audit requirement in the 100-349 band when compilation method is unrecorded', () => {
    const result = determineAssuranceLevel(150, false, undefined, false);
    expect(result.level).toBe('audit_required');
    expect(result.reason).toContain('not recorded');
  });

  it('requires independent review below 100', () => {
    expect(determineAssuranceLevel(50, false, undefined, false).level).toBe('independent_review_required');
    expect(determineAssuranceLevel(0, false, undefined, false).level).toBe('independent_review_required');
  });
});

describe('determineReportingFramework', () => {
  it('applies full IFRS to a public/state-owned company', () => {
    const result = determineReportingFramework(true, 5, false, undefined);
    expect(result.framework).toBe('full_ifrs');
    expect(result.confidence).toBe('high');
  });

  it('applies IFRS for SMEs above the fiduciary-asset threshold regardless of score', () => {
    expect(determineReportingFramework(false, 5, true, undefined).framework).toBe('ifrs_for_smes');
  });

  it('applies IFRS for SMEs at a score of 100 or more', () => {
    expect(determineReportingFramework(false, 100, false, undefined).framework).toBe('ifrs_for_smes');
  });

  it('applies IFRS for SMEs below 100 when independently compiled', () => {
    expect(determineReportingFramework(false, 50, false, 'independent').framework).toBe('ifrs_for_smes');
  });

  it('flags requires_professional_review below 100 with internal/unrecorded compilation', () => {
    const internal = determineReportingFramework(false, 50, false, 'internal');
    expect(internal.framework).toBe('other_sa_framework');
    expect(internal.confidence).toBe('requires_professional_review');

    const unrecorded = determineReportingFramework(false, 50, false, undefined);
    expect(unrecorded.framework).toBe('other_sa_framework');
    expect(unrecorded.confidence).toBe('requires_professional_review');
  });
});
