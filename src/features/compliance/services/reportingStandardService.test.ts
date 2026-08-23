import { describe, expect, it } from 'vitest';
import { ReportingStandardService } from './reportingStandardService';
import { MockReportingStandardVersionRepository } from '../repositories/MockReportingStandardVersionRepository';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';

function makeService() {
  return new ReportingStandardService(new MockReportingStandardVersionRepository([]), new AuditLogService(new MockAuditLogRepository()));
}

describe('ReportingStandardService', () => {
  it('getVersionHistory returns only the requested standard, oldest first', async () => {
    const service = makeService();
    await service.createVersion({ standard: 'ifrs_for_smes', versionLabel: 'A', effectiveFrom: '2020-01-01T00:00:00.000Z', earlyAdoptionPermitted: false, sourceReference: 'test' });
    await service.createVersion({ standard: 'full_ifrs', versionLabel: 'B', effectiveFrom: '2020-01-01T00:00:00.000Z', earlyAdoptionPermitted: false, sourceReference: 'test' });
    await service.createVersion({ standard: 'ifrs_for_smes', versionLabel: 'C', effectiveFrom: '2015-01-01T00:00:00.000Z', earlyAdoptionPermitted: false, sourceReference: 'test' });

    const history = await service.getVersionHistory('ifrs_for_smes');
    expect(history.map((v) => v.versionLabel)).toEqual(['C', 'A']);
  });

  it('supersede requires a reason and marks the prior newest version, without editing its own fields', async () => {
    const service = makeService();
    const first = await service.createVersion({
      standard: 'ifrs_for_smes',
      versionLabel: 'First',
      effectiveFrom: '2015-01-01T00:00:00.000Z',
      earlyAdoptionPermitted: false,
      sourceReference: 'test',
    });

    await expect(
      service.supersede(
        { standard: 'ifrs_for_smes', versionLabel: 'Second', effectiveFrom: '2027-01-01T00:00:00.000Z', earlyAdoptionPermitted: true, sourceReference: 'test' },
        'user_1',
        '',
      ),
    ).rejects.toThrow(/requires a reason/);

    const second = await service.supersede(
      { standard: 'ifrs_for_smes', versionLabel: 'Second', effectiveFrom: '2027-01-01T00:00:00.000Z', earlyAdoptionPermitted: true, sourceReference: 'test' },
      'user_1',
      'New edition issued',
    );

    const history = await service.getVersionHistory('ifrs_for_smes');
    const updatedFirst = history.find((v) => v.id === first.id);
    expect(updatedFirst?.supersededByVersionId).toBe(second.id);
    expect(updatedFirst?.versionLabel).toBe('First'); // never edited
    expect(updatedFirst?.effectiveFrom).toBe('2015-01-01T00:00:00.000Z'); // never edited
  });

  it('getApplicableVersion resolves via the shared resolveApplicableVersion logic', async () => {
    const service = makeService();
    await service.createVersion({ standard: 'full_ifrs', versionLabel: 'Old', effectiveFrom: '2005-01-01T00:00:00.000Z', earlyAdoptionPermitted: false, sourceReference: 'test' });
    await service.createVersion({ standard: 'full_ifrs', versionLabel: 'New', effectiveFrom: '2027-01-01T00:00:00.000Z', earlyAdoptionPermitted: true, sourceReference: 'test' });

    expect((await service.getApplicableVersion('full_ifrs', new Date('2026-01-01')))?.versionLabel).toBe('Old');
    expect((await service.getApplicableVersion('full_ifrs', new Date('2026-01-01'), true))?.versionLabel).toBe('New');
  });
});
