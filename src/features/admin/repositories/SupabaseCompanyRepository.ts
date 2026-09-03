import type { SupabaseClient } from '@supabase/supabase-js';
import type { Address, Company, ID } from '@/types';
import type { ICompanyRepository } from './ICompanyRepository';

/** One row of the `companies` table (snake_case) — see docs/SUPABASE_MIGRATION_GUIDE.md's Phase A schema. */
interface CompanyRow {
  id: string;
  name: string;
  registration_number: string | null;
  legal_entity_type: string;
  is_public_company: boolean;
  is_listed: boolean;
  has_public_accountability: boolean;
  public_interest_score: number | null;
  reporting_framework: string;
  reporting_framework_set_by: string | null;
  reporting_framework_set_at: string | null;
  reporting_framework_override_reason: string | null;
  financial_year_end_month: number;
  financial_year_end_day: number;
  accounting_basis: string;
  functional_currency: string;
  presentation_currency: string;
  financial_statements_compilation: string | null;
  is_vat_registered: boolean;
  vat_registration_number: string | null;
  vat_registration_date: string | null;
  vat_deregistration_date: string | null;
  vat_filing_frequency: string | null;
  vat_accounting_basis: string | null;
  income_tax_number: string | null;
  sdl_exempt: boolean | null;
  is_sbc_eligible: boolean | null;
  sbc_eligibility_set_by: string | null;
  sbc_eligibility_set_at: string | null;
  sbc_eligibility_reason: string | null;
  is_active: boolean;
  subscription_tier: string;
  // Phase 4B-2 — migration 0047 (AUTHORED, NOT APPLIED). All nullable.
  trading_name: string | null;
  logo: string | null;
  document_address: Address | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  document_terms: string | null;
  documents_bank_account_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToCompany(row: CompanyRow): Company {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    name: row.name,
    registrationNumber: row.registration_number ?? undefined,
    legalEntityType: row.legal_entity_type as Company['legalEntityType'],
    isPublicCompany: row.is_public_company,
    isListed: row.is_listed,
    hasPublicAccountability: row.has_public_accountability,
    publicInterestScore: row.public_interest_score ?? undefined,
    reportingFramework: row.reporting_framework as Company['reportingFramework'],
    reportingFrameworkSetBy: row.reporting_framework_set_by ?? undefined,
    reportingFrameworkSetAt: row.reporting_framework_set_at ?? undefined,
    reportingFrameworkOverrideReason: row.reporting_framework_override_reason ?? undefined,
    financialYearEndMonth: row.financial_year_end_month,
    financialYearEndDay: row.financial_year_end_day,
    accountingBasis: row.accounting_basis as Company['accountingBasis'],
    functionalCurrency: row.functional_currency,
    presentationCurrency: row.presentation_currency,
    financialStatementsCompilation: (row.financial_statements_compilation ?? undefined) as Company['financialStatementsCompilation'],
    isVatRegistered: row.is_vat_registered,
    vatRegistrationNumber: row.vat_registration_number ?? undefined,
    vatRegistrationDate: row.vat_registration_date ?? undefined,
    vatDeregistrationDate: row.vat_deregistration_date ?? undefined,
    vatFilingFrequency: (row.vat_filing_frequency ?? undefined) as Company['vatFilingFrequency'],
    vatAccountingBasis: (row.vat_accounting_basis ?? undefined) as Company['vatAccountingBasis'],
    incomeTaxNumber: row.income_tax_number ?? undefined,
    sdlExempt: row.sdl_exempt ?? undefined,
    isSbcEligible: row.is_sbc_eligible ?? undefined,
    sbcEligibilitySetBy: row.sbc_eligibility_set_by ?? undefined,
    sbcEligibilitySetAt: row.sbc_eligibility_set_at ?? undefined,
    sbcEligibilityReason: row.sbc_eligibility_reason ?? undefined,
    isActive: row.is_active,
    subscriptionTier: row.subscription_tier,
    tradingName: row.trading_name ?? undefined,
    logo: row.logo ?? undefined,
    documentAddress: row.document_address ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    website: row.website ?? undefined,
    documentTerms: row.document_terms ?? undefined,
    documentsBankAccountId: row.documents_bank_account_id ?? undefined,
  };
}

/** Maps every writable Company field to its DB column — used for both insert and update (a partial patch just omits keys). */
function companyToRow(entity: Partial<Company>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.name !== undefined) row.name = entity.name;
  if (entity.registrationNumber !== undefined) row.registration_number = entity.registrationNumber;
  if (entity.legalEntityType !== undefined) row.legal_entity_type = entity.legalEntityType;
  if (entity.isPublicCompany !== undefined) row.is_public_company = entity.isPublicCompany;
  if (entity.isListed !== undefined) row.is_listed = entity.isListed;
  if (entity.hasPublicAccountability !== undefined) row.has_public_accountability = entity.hasPublicAccountability;
  if (entity.publicInterestScore !== undefined) row.public_interest_score = entity.publicInterestScore;
  if (entity.reportingFramework !== undefined) row.reporting_framework = entity.reportingFramework;
  if (entity.reportingFrameworkSetBy !== undefined) row.reporting_framework_set_by = entity.reportingFrameworkSetBy;
  if (entity.reportingFrameworkSetAt !== undefined) row.reporting_framework_set_at = entity.reportingFrameworkSetAt;
  if (entity.reportingFrameworkOverrideReason !== undefined) row.reporting_framework_override_reason = entity.reportingFrameworkOverrideReason;
  if (entity.financialYearEndMonth !== undefined) row.financial_year_end_month = entity.financialYearEndMonth;
  if (entity.financialYearEndDay !== undefined) row.financial_year_end_day = entity.financialYearEndDay;
  if (entity.accountingBasis !== undefined) row.accounting_basis = entity.accountingBasis;
  if (entity.functionalCurrency !== undefined) row.functional_currency = entity.functionalCurrency;
  if (entity.presentationCurrency !== undefined) row.presentation_currency = entity.presentationCurrency;
  if (entity.financialStatementsCompilation !== undefined) row.financial_statements_compilation = entity.financialStatementsCompilation;
  if (entity.isVatRegistered !== undefined) row.is_vat_registered = entity.isVatRegistered;
  if (entity.vatRegistrationNumber !== undefined) row.vat_registration_number = entity.vatRegistrationNumber;
  if (entity.vatRegistrationDate !== undefined) row.vat_registration_date = entity.vatRegistrationDate;
  if (entity.vatDeregistrationDate !== undefined) row.vat_deregistration_date = entity.vatDeregistrationDate;
  if (entity.vatFilingFrequency !== undefined) row.vat_filing_frequency = entity.vatFilingFrequency;
  if (entity.vatAccountingBasis !== undefined) row.vat_accounting_basis = entity.vatAccountingBasis;
  if (entity.incomeTaxNumber !== undefined) row.income_tax_number = entity.incomeTaxNumber;
  if (entity.sdlExempt !== undefined) row.sdl_exempt = entity.sdlExempt;
  if (entity.isSbcEligible !== undefined) row.is_sbc_eligible = entity.isSbcEligible;
  if (entity.sbcEligibilitySetBy !== undefined) row.sbc_eligibility_set_by = entity.sbcEligibilitySetBy;
  if (entity.sbcEligibilitySetAt !== undefined) row.sbc_eligibility_set_at = entity.sbcEligibilitySetAt;
  if (entity.sbcEligibilityReason !== undefined) row.sbc_eligibility_reason = entity.sbcEligibilityReason;
  if (entity.isActive !== undefined) row.is_active = entity.isActive;
  if (entity.subscriptionTier !== undefined) row.subscription_tier = entity.subscriptionTier;
  // Phase 4B-2 document profile (migration 0047). `key in entity` — not
  // `!== undefined` — so an explicit clear (logo "Remove", emptied field)
  // is written through as SQL NULL rather than silently skipped.
  if ('tradingName' in entity) row.trading_name = entity.tradingName ?? null;
  if ('logo' in entity) row.logo = entity.logo ?? null;
  if ('documentAddress' in entity) row.document_address = entity.documentAddress ?? null;
  if ('phone' in entity) row.phone = entity.phone ?? null;
  if ('email' in entity) row.email = entity.email ?? null;
  if ('website' in entity) row.website = entity.website ?? null;
  if ('documentTerms' in entity) row.document_terms = entity.documentTerms ?? null;
  if ('documentsBankAccountId' in entity)
    row.documents_bank_account_id = entity.documentsBankAccountId ?? null;
  return row;
}

/**
 * Supabase-backed ICompanyRepository (docs/SUPABASE_MIGRATION_GUIDE.md
 * Phase B). Satisfies the exact same contract MockCompanyRepository does —
 * CompanyService, and everything above it, needs zero changes.
 */
export class SupabaseCompanyRepository implements ICompanyRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getAll(): Promise<Company[]> {
    const { data, error } = await this.client.from('companies').select('*').order('created_at', { ascending: true });
    if (error) throw new Error(`SupabaseCompanyRepository.getAll: ${error.message}`);
    return (data as CompanyRow[]).map(rowToCompany);
  }

  async getById(id: ID): Promise<Company | undefined> {
    const { data, error } = await this.client.from('companies').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`SupabaseCompanyRepository.getById: ${error.message}`);
    return data ? rowToCompany(data as CompanyRow) : undefined;
  }

  async create(entity: Company): Promise<Company> {
    const { data, error } = await this.client.from('companies').insert(companyToRow(entity)).select('*').single();
    if (error) throw new Error(`SupabaseCompanyRepository.create: ${error.message}`);
    return rowToCompany(data as CompanyRow);
  }

  async update(id: ID, patch: Partial<Company>): Promise<Company> {
    const { data, error } = await this.client.from('companies').update(companyToRow(patch)).eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(`SupabaseCompanyRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseCompanyRepository: company "${id}" not found`);
    return rowToCompany(data as CompanyRow);
  }
}
