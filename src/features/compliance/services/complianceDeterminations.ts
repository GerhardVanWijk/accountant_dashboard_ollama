import type {
  AuditAssuranceLevel,
  FinancialStatementCompilation,
  ReportingFramework,
  ReportingFrameworkConfidence,
} from '@/types';

/**
 * Companies Regulations, 2011 (GN R351, Government Gazette 34239, 26 April
 * 2011), regulations 26-29 — the methodology this module implements.
 * Verified 2026-08-22 by cross-checking the official CIPC summary
 * (cipc.co.za/?page_id=11891) against the aggregated regulation text
 * reported by RSM South Africa, RandCo, and The Glass Castle (independent
 * secondary sources, all converging on the same figures) — WebFetch could
 * not reliably extract the primary Government Gazette PDF text directly
 * (scanned/compressed, see this module's own build history), so this is a
 * multi-source cross-check, not a single-primary-source quote, same
 * evidentiary bar as the Phase 8 payroll-figures verification
 * (docs/KNOWN_ISSUES.md). Per SA_ACCOUNTING_MASTER_SPEC.md §110/§111, the
 * PARTS of Regulation 27 this cross-check could not pin down precisely
 * (the score-under-100/internally-compiled band, and the owner-managed
 * independent-review exemption of Companies Act s30(2A)) are flagged as
 * `requires_professional_review` below rather than presented as confirmed.
 */
export const PUBLIC_INTEREST_SCORE_SOURCE_REFERENCE =
  'Companies Regulations, 2011 (GN R351), regulations 26-29 — cross-checked 2026-08-22 against cipc.co.za/?page_id=11891, ' +
  'rsm.global/southafrica (Public Interest Score), and independent secondary summaries. Requires professional/accounting ' +
  'review before relying on any specific determination for statutory filing purposes (SA_ACCOUNTING_MASTER_SPEC.md §110/§111).';

export interface PublicInterestScorePoints {
  employeePoints: number;
  turnoverPoints: number;
  thirdPartyLiabilityPoints: number;
  shareholderPoints: number;
  totalScore: number;
}

/**
 * Regulation 26(2): 1 point per employee (average during the year), 1 point
 * per R1 million (or portion thereof) of third-party liabilities at year
 * end, 1 point per R1 million (or portion thereof) of annual turnover, 1
 * point per individual with a beneficial interest in the company's
 * securities (or per CC member). "Or a portion thereof" on the Rand-value
 * bands means round UP, never down or to nearest — a company with turnover
 * one Rand over a million-Rand boundary gets the extra point.
 */
export function calculatePublicInterestScorePoints(
  averageEmployees: number,
  turnover: number,
  thirdPartyLiabilities: number,
  shareholdersOrMembersCount: number,
): PublicInterestScorePoints {
  const employeePoints = Math.max(0, Math.ceil(averageEmployees));
  const turnoverPoints = Math.max(0, Math.ceil(turnover / 1_000_000));
  const thirdPartyLiabilityPoints = Math.max(0, Math.ceil(thirdPartyLiabilities / 1_000_000));
  const shareholderPoints = Math.max(0, Math.round(shareholdersOrMembersCount));
  return {
    employeePoints,
    turnoverPoints,
    thirdPartyLiabilityPoints,
    shareholderPoints,
    totalScore: employeePoints + turnoverPoints + thirdPartyLiabilityPoints + shareholderPoints,
  };
}

export interface AssuranceLevelDetermination {
  level: AuditAssuranceLevel;
  reason: string;
}

/**
 * Regulations 28 (audit) and 29 (independent review):
 * - A public or state-owned company's AFS must be audited regardless of
 *   score (Companies Act s30(2)(b)) — not itself a Regulation 26-29 rule,
 *   but the threshold this function checks first for that reason.
 * - Holding fiduciary assets exceeding R5 million forces audit regardless
 *   of score (reg 28(2)(b)).
 * - Public Interest Score >= 350: audit required regardless of compilation
 *   method (reg 28(2)(a)).
 * - Score 100-349: audit required ONLY if internally compiled; otherwise
 *   independent review (reg 28(2)(c) / reg 29). When the compilation method
 *   is not recorded, this function deliberately defaults to the STRICTER
 *   outcome (audit) rather than guessing — the same "unresolvable ->
 *   conservative default" principle `billService.splitDeductibleVat()`
 *   already applies to non-deductible VAT.
 * - Score < 100: independent review required (reg 29), UNLESS the company
 *   qualifies for the Companies Act s30(2A) "owner-managed" exemption
 *   (every shareholder is also a director) — NOT modeled here, since this
 *   codebase has no shareholder register to check it against (same gap
 *   Dividends Tax already flags). Always surfaced as a note, never silently
 *   assumed to apply.
 */
export function determineAssuranceLevel(
  totalScore: number,
  holdsFiduciaryAssetsOverThreshold: boolean,
  compilation: FinancialStatementCompilation | undefined,
  isPublicOrStateOwned: boolean,
): AssuranceLevelDetermination {
  if (isPublicOrStateOwned) {
    return {
      level: 'audit_required',
      reason: 'Public or state-owned company — audited financial statements are required regardless of Public Interest Score (Companies Act s30(2)(b)).',
    };
  }
  if (holdsFiduciaryAssetsOverThreshold) {
    return {
      level: 'audit_required',
      reason: 'Holds assets exceeding R5 million in a fiduciary capacity — audited financial statements are required regardless of score (Companies Regulations 2011 reg 28(2)(b)).',
    };
  }
  if (totalScore >= 350) {
    return {
      level: 'audit_required',
      reason: `Public Interest Score of ${totalScore} is 350 or more — audit required regardless of compilation method (reg 28(2)(a)).`,
    };
  }
  if (totalScore >= 100) {
    if (compilation === 'independent') {
      return {
        level: 'independent_review_required',
        reason: `Public Interest Score of ${totalScore} is 100-349 and financial statements are independently compiled — audit is not required; an independent review is required instead (reg 29).`,
      };
    }
    return {
      level: 'audit_required',
      reason:
        compilation === 'internal'
          ? `Public Interest Score of ${totalScore} is 100-349 and financial statements are internally compiled — audit required (reg 28(2)(c)).`
          : `Public Interest Score of ${totalScore} is 100-349, and the compilation method (internal vs. independent) is not recorded on Company.financialStatementsCompilation — defaulting to the stricter audit requirement (reg 28(2)(c)) pending that being confirmed. Record the compilation method to get a precise answer.`,
    };
  }
  return {
    level: 'independent_review_required',
    reason: `Public Interest Score of ${totalScore} is below 100 — independent review required (reg 29), UNLESS every shareholder is also a director (Companies Act s30(2A) "owner-managed" exemption) — this system has no shareholder register to check that against, so the exemption is never assumed; verify with your accountant.`,
  };
}

export interface ReportingFrameworkDetermination {
  framework: ReportingFramework;
  confidence: ReportingFrameworkConfidence;
  reason: string;
}

/**
 * Regulation 27 (Financial Reporting Standards). Cross-checked sources agree
 * on: state-owned companies and listed public companies must use full IFRS;
 * every profit company with a Public Interest Score of 100 or more, or
 * holding fiduciary assets over R5 million, must use IFRS for SMEs; a score
 * below 100 with independently-compiled statements also uses IFRS for SMEs.
 * The remaining band — score below 100 AND internally compiled — is where
 * Regulation 27 leaves the applicable standard to the company's own
 * discretion; this function does not guess which standard that discretion
 * lands on (§110), so it returns `other_sa_framework` with
 * `requires_professional_review` confidence for that one band only.
 */
export function determineReportingFramework(
  isPublicOrStateOwned: boolean,
  totalScore: number,
  holdsFiduciaryAssetsOverThreshold: boolean,
  compilation: FinancialStatementCompilation | undefined,
): ReportingFrameworkDetermination {
  if (isPublicOrStateOwned) {
    return {
      framework: 'full_ifrs',
      confidence: 'high',
      reason: 'State-owned or listed public company — full IFRS applies (reg 27).',
    };
  }
  if (holdsFiduciaryAssetsOverThreshold) {
    return {
      framework: 'ifrs_for_smes',
      confidence: 'high',
      reason: 'Holds assets exceeding R5 million in a fiduciary capacity — IFRS for SMEs applies (reg 27).',
    };
  }
  if (totalScore >= 100) {
    return {
      framework: 'ifrs_for_smes',
      confidence: 'high',
      reason: `Public Interest Score of ${totalScore} is 100 or more — IFRS for SMEs applies (reg 27).`,
    };
  }
  if (compilation === 'independent') {
    return {
      framework: 'ifrs_for_smes',
      confidence: 'high',
      reason: `Public Interest Score of ${totalScore} is below 100, but financial statements are independently compiled — IFRS for SMEs applies (reg 27).`,
    };
  }
  return {
    framework: 'other_sa_framework',
    confidence: 'requires_professional_review',
    reason: `Public Interest Score of ${totalScore} is below 100 and financial statements are (or may be) internally compiled — Regulation 27 leaves the applicable reporting standard to the company's discretion in this band. This system cannot determine which standard that should be automatically; requires professional/accounting review before relying on it.`,
  };
}
