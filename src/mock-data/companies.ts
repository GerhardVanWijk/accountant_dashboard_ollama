import type { Company } from '@/types';

/**
 * Single seed company. reportingFramework is deliberately
 * 'not_yet_determined' — see src/types/company.ts's doc comment: guessing
 * it would violate docs/SA_ACCOUNTING_MASTER_SPEC.md §110 ("no unsupported
 * claims"). An accountant/admin sets it explicitly via
 * CompanyService.setReportingFramework().
 */
export const seedCompanies: Company[] = [
  {
    id: 'comp_001',
    name: 'Demo Trading (Pty) Ltd',
    registrationNumber: '2020/123456/07',
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
    isVatRegistered: true,
    vatRegistrationNumber: '4123456789',
    vatRegistrationDate: '2020-03-01T00:00:00.000Z',
    incomeTaxNumber: '9123456789',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];
