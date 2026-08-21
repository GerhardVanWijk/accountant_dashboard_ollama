import { describe, it, expect } from 'vitest';
import { CompanyService } from './companyService';
import { MockCompanyRepository } from '../repositories/MockCompanyRepository';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import type { Company } from '@/types';

function makeCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: 'comp_1',
    name: 'Test Co (Pty) Ltd',
    legalEntityType: 'private_company',
    isPublicCompany: false,
    isListed: false,
    hasPublicAccountability: false,
    reportingFramework: 'not_yet_determined',
    financialYearEndMonth: 12,
    financialYearEndDay: 31,
    accountingBasis: 'accrual',
    functionalCurrency: 'ZAR',
    presentationCurrency: 'ZAR',
    isVatRegistered: false,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function setup(companies: Company[] = [makeCompany()]) {
  const repository = new MockCompanyRepository(companies);
  const auditLog = new AuditLogService(new MockAuditLogRepository());
  const service = new CompanyService(repository, auditLog);
  return { service, repository, auditLog };
}

describe('CompanyService', () => {
  describe('setReportingFramework', () => {
    it('requires a non-empty reason', async () => {
      const { service } = setup();
      await expect(service.setReportingFramework('comp_1', 'ifrs_for_smes', 'user_1', '')).rejects.toThrow(
        /requires a reason/i,
      );
    });

    it('updates the framework and records who/when/why', async () => {
      const { service, auditLog } = setup();
      const updated = await service.setReportingFramework(
        'comp_1',
        'ifrs_for_smes',
        'user_1',
        'Confirmed by accountant against Companies Regulations thresholds',
      );

      expect(updated.reportingFramework).toBe('ifrs_for_smes');
      expect(updated.reportingFrameworkSetBy).toBe('user_1');
      expect(updated.reportingFrameworkOverrideReason).toContain('Companies Regulations');

      const logs = await auditLog.getForRecord('Company', 'comp_1');
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('reporting_framework_changed');
      expect(logs[0].previousValue).toEqual({ reportingFramework: 'not_yet_determined' });
      expect(logs[0].newValue).toEqual({ reportingFramework: 'ifrs_for_smes' });
    });

    it('throws for a company that does not exist', async () => {
      const { service } = setup();
      await expect(service.setReportingFramework('nope', 'full_ifrs', 'user_1', 'reason')).rejects.toThrow(
        /not found/i,
      );
    });
  });
});
