import type { BaseEntity, ID, ISODateString } from './common';
import type { FinancialStatementCompilation, ReportingFramework } from './company';

/**
 * Which assurance engagement a company's annual financial statements
 * require, per Companies Regulations, 2011, regulations 28 ("audit") and 29
 * ("independent review") — SA_ACCOUNTING_MASTER_SPEC.md §3/§116 Phase 11.
 */
export type AuditAssuranceLevel = 'audit_required' | 'independent_review_required';

/** How confidently `determineReportingFramework()` could resolve the applicable standard — see that function's doc comment. */
export type ReportingFrameworkConfidence = 'high' | 'requires_professional_review';

/** The raw inputs behind one Public Interest Score calculation — see `PublicInterestScore`'s doc comment for where each figure comes from. */
export interface PublicInterestScoreComponents {
  /** Average headcount across the financial year, real Employee data — `calculateAverageEmployeeCount()`. */
  averageEmployees: number;
  /** Real posted revenue for the financial year — `calculateIncomeStatement().revenueTotal`. */
  turnover: number;
  /** Real posted total liabilities as at financial year end — `calculateBalanceSheet().totalLiabilities`. */
  thirdPartyLiabilities: number;
  /** Manually entered — no shareholder/member register exists anywhere in this codebase (see docs/SA_SPEC_GAP_ANALYSIS.md). */
  shareholdersOrMembersCount: number;
}

/**
 * One Public Interest Score calculation for one company/financial year
 * (SA_ACCOUNTING_MASTER_SPEC.md §3, Companies Regulations 2011 reg 26(2)).
 * Append-only, like every other compliance/audit record in this codebase
 * (`IJournalEntryRepository`, `IAuditLogRepository`) — a re-calculation
 * creates a NEW row, it never edits a prior one, so the score's own history
 * is itself an audit trail (§3: "retain historical scores").
 *
 * `suggestedAssuranceLevel`/`suggestedReportingFramework` are exactly
 * that — suggestions. Nothing in this codebase ever applies a suggested
 * `ReportingFramework` to `Company.reportingFramework` automatically; §3
 * explicitly forbids silently changing it. Applying the suggestion still
 * requires the existing `CompanyService.setReportingFramework()` authorized-
 * override workflow, with its own recorded reason — see
 * `PublicInterestScorePage`.
 */
export interface PublicInterestScore extends BaseEntity {
  companyId: ID;
  financialYearId: ID;
  components: PublicInterestScoreComponents;
  /** ceil(averageEmployees) — "one point per employee". */
  employeePoints: number;
  /** ceil(turnover / R1,000,000) — "or a portion thereof". */
  turnoverPoints: number;
  /** ceil(thirdPartyLiabilities / R1,000,000) — "or a portion thereof". */
  thirdPartyLiabilityPoints: number;
  /** Equal to `components.shareholdersOrMembersCount`, rounded/floored non-negative. */
  shareholderPoints: number;
  /** employeePoints + turnoverPoints + thirdPartyLiabilityPoints + shareholderPoints. */
  totalScore: number;
  /** Manual input: holds assets exceeding R5 million in a fiduciary capacity — forces audit regardless of score (reg 28(2)). */
  holdsFiduciaryAssetsOverThreshold: boolean;
  /** Snapshot of `Company.financialStatementsCompilation` at calculation time — the score is a historical record, so a later change to the company's compilation method must not rewrite this row's own reasoning. */
  financialStatementsCompilation?: FinancialStatementCompilation;
  suggestedAssuranceLevel: AuditAssuranceLevel;
  /** Plain-language explanation citing which regulation/band produced `suggestedAssuranceLevel` — §109's "why did the system calculate this" traceability requirement. */
  assuranceLevelReason: string;
  suggestedReportingFramework: ReportingFramework;
  reportingFrameworkConfidence: ReportingFrameworkConfidence;
  /** Plain-language explanation citing which regulation/band produced `suggestedReportingFramework`. */
  reportingFrameworkReason: string;
  /** True when `suggestedReportingFramework` differs from `Company.reportingFramework` at calculation time — drives the "framework may need to change" warning banner (§3), never an automatic change. */
  frameworkDiffersFromCurrent: boolean;
  calculatedAt: ISODateString;
  calculatedBy: ID;
  /** Regulation/source citation for the methodology applied — see `PUBLIC_INTEREST_SCORE_SOURCE_REFERENCE`. */
  sourceReference: string;
}
