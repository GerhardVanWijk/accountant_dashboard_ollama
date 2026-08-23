import type { ID, ReportingStandardName, ReportingStandardVersion } from '@/types';
import type { IReportingStandardVersionRepository } from '../repositories/IReportingStandardVersionRepository';
import type { AuditLogService } from '@/services/auditLogService';
import { resolveApplicableVersion } from './reportingStandardCalculations';

export type CreateReportingStandardVersionDTO = Omit<ReportingStandardVersion, 'id' | 'createdAt' | 'updatedAt' | 'supersededByVersionId'>;

/**
 * IFRS / IFRS for SMEs disclosure-framework versioning engine
 * (SA_ACCOUNTING_MASTER_SPEC.md §48/§49) — see `src/types/reportingStandard.ts`'s
 * doc comment for the full design rationale and honest scope boundary
 * (this resolves which EDITION of a framework applies to a reporting
 * period; it does not encode the framework's actual disclosure content).
 */
export class ReportingStandardService {
  constructor(
    private readonly repository: IReportingStandardVersionRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  async getVersions(): Promise<ReportingStandardVersion[]> {
    return this.repository.getAll();
  }

  /** Every version of one standard, oldest first. */
  async getVersionHistory(standard: ReportingStandardName): Promise<ReportingStandardVersion[]> {
    const all = await this.repository.getAll();
    return all.filter((v) => v.standard === standard).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  }

  /**
   * Which edition of `standard` applies to a reporting period beginning on
   * `periodStartDate`: the version with the latest `effectiveFrom` that is
   * still `<= periodStartDate`. If `earlyAdoptionElected` is true AND a
   * later version (one whose `effectiveFrom` is still in the future
   * relative to `periodStartDate`) permits early adoption, that later
   * version is returned instead — an explicit, recorded election, never
   * assumed. Returns undefined only if no version of this standard has an
   * `effectiveFrom` on or before `periodStartDate` and none permits early
   * adoption either (should not happen given the seeded history, but never
   * silently guesses one).
   */
  async getApplicableVersion(
    standard: ReportingStandardName,
    periodStartDate: Date,
    earlyAdoptionElected = false,
  ): Promise<ReportingStandardVersion | undefined> {
    const history = await this.getVersionHistory(standard);
    return resolveApplicableVersion(history, periodStartDate, earlyAdoptionElected);
  }

  /** Registers a brand-new standard/version pair that has never existed before (e.g. a future new framework, not a new edition of one already tracked). */
  async createVersion(data: CreateReportingStandardVersionDTO): Promise<ReportingStandardVersion> {
    return this.repository.create({ ...data, id: '', createdAt: '', updatedAt: '' });
  }

  /**
   * Adds a new edition of an existing standard WITHOUT touching any prior
   * version's own fields — only sets `supersededByVersionId` on whichever
   * prior version was, until now, the newest one for this standard.
   * Mirrors `TaxRateService.supersede()`'s exact "never edit history"
   * discipline. A reason is mandatory and the change is audit-logged.
   */
  async supersede(data: CreateReportingStandardVersionDTO, userId: ID, reason: string): Promise<ReportingStandardVersion> {
    if (!reason || !reason.trim()) {
      throw new Error('Adding a new reporting-standard edition requires a reason.');
    }
    const history = await this.getVersionHistory(data.standard);
    const newest = history[history.length - 1];

    const created = await this.repository.create({ ...data, id: '', createdAt: '', updatedAt: '' });

    if (newest) {
      await this.repository.update(newest.id, { supersededByVersionId: created.id });
    }

    await this.auditLog.log({
      userId,
      action: 'created',
      module: 'compliance',
      recordType: 'ReportingStandardVersion',
      recordId: created.id,
      previousValue: newest ? { versionLabel: newest.versionLabel, effectiveFrom: newest.effectiveFrom } : null,
      newValue: { versionLabel: created.versionLabel, effectiveFrom: created.effectiveFrom },
      reason,
    });

    return created;
  }
}
