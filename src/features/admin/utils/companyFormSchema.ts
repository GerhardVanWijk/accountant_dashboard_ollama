import { z } from 'zod';
import type { Address, Company } from '@/types';

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
 *
 * Phase 4B-2 adds the "Document & branding" section (trading name, logo
 * data URL, document address, phone/email/website, default document
 * terms, and the bank account shown on documents) — migration 0047,
 * AUTHORED NOT APPLIED. See docs/BUSINESS_DOCUMENTS.md.
 */

/** png / jpeg / webp / svg only, <= 512 KB pre-encode — enforced in the form, restated here for reuse. */
export const LOGO_ACCEPTED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] as const;
export const LOGO_MAX_BYTES = 512 * 1024;

const documentAddressSchema = z.object({
  line1: z.string().optional(),
  line2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
});

const optionalEmail = z
  .string()
  .optional()
  .refine((value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 'Enter a valid email address');

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

  // Phase 4B-2 — "Document & branding".
  tradingName: z.string().optional(),
  /** A `data:image/...;base64,...` URL, or '' for no logo. Mime/size validation is done in the form on file pick. */
  logo: z.string().optional(),
  documentAddress: documentAddressSchema,
  phone: z.string().optional(),
  email: optionalEmail,
  website: z.string().optional(),
  documentTerms: z.string().optional(),
  /** '' = "None" (omit the payment block); otherwise a bank_accounts id. */
  documentsBankAccountId: z.string().optional(),
});

export type CompanyFormValues = z.infer<typeof companyFormSchema>;

function addressToFormValues(address: Address | undefined): CompanyFormValues['documentAddress'] {
  return {
    line1: address?.line1 ?? '',
    line2: address?.line2 ?? '',
    city: address?.city ?? '',
    state: address?.state ?? '',
    postalCode: address?.postalCode ?? '',
    country: address?.country ?? '',
  };
}

/** Rebuilds an Address from the form sub-fields, or `null` when every field is blank. */
function formValuesToAddress(values: CompanyFormValues['documentAddress']): Address | null {
  const trimmed = {
    line1: values.line1?.trim() ?? '',
    line2: values.line2?.trim() ?? '',
    city: values.city?.trim() ?? '',
    state: values.state?.trim() ?? '',
    postalCode: values.postalCode?.trim() ?? '',
    country: values.country?.trim() ?? '',
  };
  const anyFilled = Object.values(trimmed).some((v) => v.length > 0);
  if (!anyFilled) return null;
  return {
    line1: trimmed.line1,
    line2: trimmed.line2 || undefined,
    city: trimmed.city,
    state: trimmed.state || undefined,
    postalCode: trimmed.postalCode || undefined,
    country: trimmed.country,
  };
}

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
    tradingName: company.tradingName ?? '',
    logo: company.logo ?? '',
    documentAddress: addressToFormValues(company.documentAddress),
    phone: company.phone ?? '',
    email: company.email ?? '',
    website: company.website ?? '',
    documentTerms: company.documentTerms ?? '',
    documentsBankAccountId: company.documentsBankAccountId ?? '',
  };
}

/**
 * Maps form values to a Company patch — never touches
 * reportingFramework/isSbcEligible (see file doc comment). The Phase 4B-2
 * document-profile keys are ALWAYS present in the patch (as a value or
 * `undefined`) so an emptied field / removed logo is cleared, not just
 * skipped — SupabaseCompanyRepository.companyToRow writes `undefined` here
 * through as SQL NULL for those keys.
 */
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
    tradingName: values.tradingName?.trim() || undefined,
    logo: values.logo?.trim() || undefined,
    documentAddress: formValuesToAddress(values.documentAddress) ?? undefined,
    phone: values.phone?.trim() || undefined,
    email: values.email?.trim() || undefined,
    website: values.website?.trim() || undefined,
    documentTerms: values.documentTerms?.trim() || undefined,
    documentsBankAccountId: values.documentsBankAccountId?.trim() || undefined,
  };
}
