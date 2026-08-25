import { z } from 'zod';
import type { Company } from '@/types';

/**
 * Company profile edit form (M2, docs/V0_DASHBOARD_INTEGRATION.md). No
 * companyFormSchema existed before this — the pre-v0 app never had a
 * dedicated Company edit UI (CompanyService.updateCompany() was only
 * exercised by admin tooling/tests). Deliberately excludes
 * reportingFramework and isSbcEligible: those two fields legislatively
 * require a recorded reason and are written only through
 * CompanyService.setReportingFramework()/setSbcEligibility() (see that
 * service's doc comments) — routing them through a generic patch here
 * would silently bypass the audit-reason requirement, so this form
 * cannot touch them.
 */
export const companyFormSchema = z.object({
  name: z.string().min(1, 'Company name is required'),
  registrationNumber: z.string().optional(),
  legalEntityType: z.enum([
    'private_company',
    'public_company',
    'personal_liability_company',
    'state_owned_company',
    'non_profit_company',
    'close_corporation',
    'sole_proprietor',
    'partnership',
    'trust',
    'external_company',
    'other',
  ]),
  isPublicCompany: z.boolean(),
  isListed: z.boolean(),
  financialYearEndMonth: z.coerce.number().min(1).max(12),
  financialYearEndDay: z.coerce.number().min(1).max(31),
  accountingBasis: z.enum(['accrual', 'cash']),
  functionalCurrency: z.string().min(1, 'Functional currency is required'),
  presentationCurrency: z.string().min(1, 'Presentation currency is required'),
  isVatRegistered: z.boolean(),
  vatRegistrationNumber: z.string().optional(),
  vatFilingFrequency: z.enum(['monthly', 'bi_monthly', 'six_monthly', 'annual']).optional(),
  vatAccountingBasis: z.enum(['invoice', 'payments']).optional(),
  incomeTaxNumber: z.string().optional(),
  isActive: z.boolean(),
});

export type CompanyFormValues = z.infer<typeof companyFormSchema>;

export function companyToFormValues(company: Company): CompanyFormValues {
  return {
    name: company.name,
    registrationNumber: company.registrationNumber ?? '',
    legalEntityType: company.legalEntityType,
    isPublicCompany: company.isPublicCompany,
    isListed: company.isListed,
    financialYearEndMonth: company.financialYearEndMonth,
    financialYearEndDay: company.financialYearEndDay,
    accountingBasis: company.accountingBasis,
    functionalCurrency: company.functionalCurrency,
    presentationCurrency: company.presentationCurrency,
    isVatRegistered: company.isVatRegistered,
    vatRegistrationNumber: company.vatRegistrationNumber ?? '',
    vatFilingFrequency: company.vatFilingFrequency,
    vatAccountingBasis: company.vatAccountingBasis,
    incomeTaxNumber: company.incomeTaxNumber ?? '',
    isActive: company.isActive,
  };
}

/** Maps form values to a Company patch — never touches reportingFramework/isSbcEligible (see file doc comment). */
export function formValuesToCompanyPatch(values: CompanyFormValues): Partial<Company> {
  return {
    name: values.name.trim(),
    registrationNumber: values.registrationNumber?.trim() || undefined,
    legalEntityType: values.legalEntityType,
    isPublicCompany: values.isPublicCompany,
    isListed: values.isListed,
    financialYearEndMonth: values.financialYearEndMonth,
    financialYearEndDay: values.financialYearEndDay,
    accountingBasis: values.accountingBasis,
    functionalCurrency: values.functionalCurrency.trim(),
    presentationCurrency: values.presentationCurrency.trim(),
    isVatRegistered: values.isVatRegistered,
    vatRegistrationNumber: values.vatRegistrationNumber?.trim() || undefined,
    vatFilingFrequency: values.vatFilingFrequency,
    vatAccountingBasis: values.vatAccountingBasis,
    incomeTaxNumber: values.incomeTaxNumber?.trim() || undefined,
    isActive: values.isActive,
  };
}
