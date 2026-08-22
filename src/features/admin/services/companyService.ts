import type { Company, ID, ReportingFramework } from '@/types';
import type { ICompanyRepository } from '../repositories/ICompanyRepository';
import type { AuditLogService } from '@/services/auditLogService';

export type CreateCompanyDTO = Omit<Company, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Company/entity configuration (docs/SA_ACCOUNTING_MASTER_SPEC.md §2).
 * Deliberately does NOT implement automatic Public Interest Score
 * calculation or automatic reporting-framework determination (§3) — see
 * src/types/company.ts's doc comment and docs/SA_SPEC_GAP_ANALYSIS.md.
 */
export class CompanyService {
  constructor(
    private readonly repository: ICompanyRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  async getCompanies(): Promise<Company[]> {
    return this.repository.getAll();
  }

  async getCompany(id: ID): Promise<Company | undefined> {
    return this.repository.getById(id);
  }

  async createCompany(data: CreateCompanyDTO): Promise<Company> {
    const now = new Date().toISOString();
    return this.repository.create({ ...data, id: '', createdAt: now, updatedAt: now });
  }

  async updateCompany(id: ID, patch: Partial<Company>): Promise<Company> {
    return this.repository.update(id, patch);
  }

  /**
   * The ONLY way reportingFramework may change. Per §2 ("The user must be
   * able to override the automatically determined framework only through
   * an authorized accounting/admin workflow, with the reason recorded" —
   * and since there IS no automatic determination yet, every framework
   * assignment today is necessarily this kind of recorded override), a
   * reason is mandatory and the change is written to the audit trail.
   */
  async setReportingFramework(
    companyId: ID,
    framework: ReportingFramework,
    userId: ID,
    reason: string,
  ): Promise<Company> {
    if (!reason || !reason.trim()) {
      throw new Error('Changing the reporting framework requires a reason.');
    }
    const company = await this.repository.getById(companyId);
    if (!company) {
      throw new Error(`Company "${companyId}" not found.`);
    }

    const now = new Date().toISOString();
    const updated = await this.repository.update(companyId, {
      reportingFramework: framework,
      reportingFrameworkSetBy: userId,
      reportingFrameworkSetAt: now,
      reportingFrameworkOverrideReason: reason,
    });

    await this.auditLog.log({
      userId,
      action: 'reporting_framework_changed',
      module: 'admin',
      recordType: 'Company',
      recordId: companyId,
      previousValue: { reportingFramework: company.reportingFramework },
      newValue: { reportingFramework: framework },
      reason,
    });

    return updated;
  }

  /**
   * The ONLY way isSbcEligible may change (SA_ACCOUNTING_MASTER_SPEC.md
   * §53, Phase 9 "Tax") — copies setReportingFramework()'s exact shape
   * above. SBC eligibility legislatively depends on shareholder
   * composition, personal-service-company classification, and
   * ownership-in-other-companies restrictions, none of which this app
   * models (src/types/company.ts's isSbcEligible doc comment) — so, same
   * as the reporting framework, a reason is mandatory and the change is
   * written to the audit trail rather than ever being auto-determined.
   */
  async setSbcEligibility(companyId: ID, isEligible: boolean, userId: ID, reason: string): Promise<Company> {
    if (!reason || !reason.trim()) {
      throw new Error('Changing SBC eligibility requires a reason.');
    }
    const company = await this.repository.getById(companyId);
    if (!company) {
      throw new Error(`Company "${companyId}" not found.`);
    }

    const now = new Date().toISOString();
    const updated = await this.repository.update(companyId, {
      isSbcEligible: isEligible,
      sbcEligibilitySetBy: userId,
      sbcEligibilitySetAt: now,
      sbcEligibilityReason: reason,
    });

    await this.auditLog.log({
      userId,
      // 'edited' — src/types/auditLog.ts's AuditAction union (outside this
      // bee's file scope) has no dedicated SBC-specific action yet; this is
      // the closest honest fit for "a Company field changed" without
      // fabricating a new union member from a file this dispatch doesn't
      // own. previousValue/newValue/reason below still record exactly what
      // changed and why.
      action: 'edited',
      module: 'admin',
      recordType: 'Company',
      recordId: companyId,
      previousValue: { isSbcEligible: company.isSbcEligible ?? false },
      newValue: { isSbcEligible: isEligible },
      reason,
    });

    return updated;
  }
}
