import type { Account, Company, Employee, FinancialYear, ID, JournalEntry, PublicInterestScore } from '@/types';
import type { IPublicInterestScoreRepository } from '../repositories/IPublicInterestScoreRepository';
import type { AuditLogService } from '@/services/auditLogService';
import { calculateIncomeStatement } from '@/features/reports/financialStatements/services/calculateIncomeStatement';
import { calculateBalanceSheet } from '@/features/reports/financialStatements/services/calculateBalanceSheet';
import { calculateAverageEmployeeCount } from '../utils/calculateAverageEmployeeCount';
import { calculatePublicInterestScorePoints, determineAssuranceLevel, determineReportingFramework, PUBLIC_INTEREST_SCORE_SOURCE_REFERENCE } from './complianceDeterminations';

export interface CalculatePublicInterestScoreInput {
  companyId: ID;
  financialYearId: ID;
  shareholdersOrMembersCount: number;
  holdsFiduciaryAssetsOverThreshold: boolean;
  calculatedBy: ID;
}

/** Narrow surfaces this service needs — same "narrow interface, real singleton injected in services/index.ts" pattern every other module here uses. */
export interface LedgerLookup {
  getAccounts(): Promise<Account[]>;
  getEntries(): Promise<JournalEntry[]>;
}
export interface EmployeeLookup {
  getEmployees(): Promise<Employee[]>;
}
export interface FinancialYearLookup {
  getFinancialYears(): Promise<FinancialYear[]>;
}
export interface CompanyLookup {
  getCompanies(): Promise<Company[]>;
}

/**
 * Public Interest Score engine (SA_ACCOUNTING_MASTER_SPEC.md §3, §116 Phase
 * 11 "Compliance") — the last deliberately-deferred piece of Phase 1
 * ("Accounting Core") flagged in docs/SA_SPEC_GAP_ANALYSIS.md since
 * 2026-08-21: "requires verifying the exact Companies Regulations
 * methodology against source legislation, not guessed." That verification
 * is now done (see complianceDeterminations.ts's doc comment for the
 * sourcing) — this service composes it with real data already in this
 * codebase (posted GL revenue/liabilities via the Phase 10 Reports module's
 * pure calculators, real Employee headcount) rather than asking for numbers
 * this app already knows.
 *
 * Never mutates `Company.reportingFramework` — `calculateScore()` only
 * SUGGESTS one and flags whether it differs from the company's current
 * value. Applying a suggestion is still exactly
 * `CompanyService.setReportingFramework()`'s existing authorized-override
 * workflow (own reason, own audit entry) — see `PublicInterestScorePage`.
 */
export class PublicInterestScoreService {
  constructor(
    private readonly repository: IPublicInterestScoreRepository,
    private readonly ledger: LedgerLookup,
    private readonly employees: EmployeeLookup,
    private readonly financialYears: FinancialYearLookup,
    private readonly companies: CompanyLookup,
    private readonly auditLog: AuditLogService,
  ) {}

  async calculateScore(input: CalculatePublicInterestScoreInput): Promise<PublicInterestScore> {
    if (!Number.isFinite(input.shareholdersOrMembersCount) || input.shareholdersOrMembersCount < 0) {
      throw new Error('Number of shareholders/members must be a non-negative number.');
    }

    const [financialYears, companies, accounts, entries, employees] = await Promise.all([
      this.financialYears.getFinancialYears(),
      this.companies.getCompanies(),
      this.ledger.getAccounts(),
      this.ledger.getEntries(),
      this.employees.getEmployees(),
    ]);

    const financialYear = financialYears.find((fy) => fy.id === input.financialYearId);
    if (!financialYear) {
      throw new Error(`Financial year "${input.financialYearId}" not found.`);
    }
    const company = companies.find((c) => c.id === input.companyId);
    if (!company) {
      throw new Error(`Company "${input.companyId}" not found.`);
    }

    const turnover = calculateIncomeStatement(entries, accounts, financialYear.startDate, financialYear.endDate).revenueTotal;
    const thirdPartyLiabilities = calculateBalanceSheet(
      entries,
      accounts,
      financialYear.endDate,
      financialYear.startDate,
    ).totalLiabilities;
    const averageEmployees = calculateAverageEmployeeCount(employees, new Date(financialYear.startDate), new Date(financialYear.endDate));

    const points = calculatePublicInterestScorePoints(
      averageEmployees,
      turnover,
      thirdPartyLiabilities,
      input.shareholdersOrMembersCount,
    );

    const isPublicOrStateOwned = company.legalEntityType === 'state_owned_company' || (company.isPublicCompany && company.isListed);
    const assurance = determineAssuranceLevel(
      points.totalScore,
      input.holdsFiduciaryAssetsOverThreshold,
      company.financialStatementsCompilation,
      isPublicOrStateOwned,
    );
    const framework = determineReportingFramework(
      isPublicOrStateOwned,
      points.totalScore,
      input.holdsFiduciaryAssetsOverThreshold,
      company.financialStatementsCompilation,
    );

    const now = new Date().toISOString();
    const created = await this.repository.create({
      id: '',
      createdAt: now,
      updatedAt: now,
      companyId: input.companyId,
      financialYearId: input.financialYearId,
      components: {
        averageEmployees,
        turnover,
        thirdPartyLiabilities,
        shareholdersOrMembersCount: input.shareholdersOrMembersCount,
      },
      employeePoints: points.employeePoints,
      turnoverPoints: points.turnoverPoints,
      thirdPartyLiabilityPoints: points.thirdPartyLiabilityPoints,
      shareholderPoints: points.shareholderPoints,
      totalScore: points.totalScore,
      holdsFiduciaryAssetsOverThreshold: input.holdsFiduciaryAssetsOverThreshold,
      financialStatementsCompilation: company.financialStatementsCompilation,
      suggestedAssuranceLevel: assurance.level,
      assuranceLevelReason: assurance.reason,
      suggestedReportingFramework: framework.framework,
      reportingFrameworkConfidence: framework.confidence,
      reportingFrameworkReason: framework.reason,
      frameworkDiffersFromCurrent: framework.framework !== company.reportingFramework,
      calculatedAt: now,
      calculatedBy: input.calculatedBy,
      sourceReference: PUBLIC_INTEREST_SCORE_SOURCE_REFERENCE,
    });

    await this.auditLog.log({
      userId: input.calculatedBy,
      action: 'public_interest_score_calculated',
      module: 'compliance',
      recordType: 'PublicInterestScore',
      recordId: created.id,
      newValue: { totalScore: created.totalScore, suggestedAssuranceLevel: created.suggestedAssuranceLevel, suggestedReportingFramework: created.suggestedReportingFramework },
    });

    return created;
  }

  /**
   * Newest first. Reverses insertion order rather than sorting by
   * `calculatedAt` — two calculations made in quick succession can land on
   * the same millisecond timestamp, which would make a string-compare sort
   * unstable between them; the repository's append-only insertion order is
   * always a true, unambiguous chronology.
   */
  async getScoreHistory(companyId: ID): Promise<PublicInterestScore[]> {
    const scores = await this.repository.getByCompany(companyId);
    return [...scores].reverse();
  }

  async getLatestScore(companyId: ID): Promise<PublicInterestScore | undefined> {
    const history = await this.getScoreHistory(companyId);
    return history[0];
  }
}
