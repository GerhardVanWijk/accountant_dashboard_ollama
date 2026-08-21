import type { BaseEntity, CurrencyCode, ID, ISODateString } from './common';

/**
 * South African legal entity types under the Companies Act 71 of 2008 (plus
 * pre-2011 Close Corporations, which still exist but can no longer be newly
 * registered, and non-company forms this software must also support).
 * See docs/SA_ACCOUNTING_MASTER_SPEC.md §2.
 */
export type SALegalEntityType =
  | 'private_company' // (Pty) Ltd
  | 'public_company' // Ltd
  | 'personal_liability_company' // Inc
  | 'state_owned_company' // SOC Ltd
  | 'non_profit_company' // NPC
  | 'close_corporation' // CC — legacy, no new registrations since May 2011
  | 'sole_proprietor'
  | 'partnership'
  | 'trust'
  | 'external_company'
  | 'other';

/**
 * Which financial reporting framework applies. `not_yet_determined` is the
 * honest default: automatically determining this requires a Public Interest
 * Score calculation against the Companies Regulations methodology, which is
 * NOT implemented yet (docs/SA_SPEC_GAP_ANALYSIS.md) — guessing the formula
 * would violate docs/SA_ACCOUNTING_MASTER_SPEC.md §110's "no unsupported
 * claims" rule. Until that engine exists, a real company record must have
 * this set explicitly by an accountant/admin via CompanyService.setReportingFramework(),
 * which requires a recorded reason (§2: "override ... only through an
 * authorized accounting/admin workflow, with the reason recorded").
 */
export type ReportingFramework =
  | 'full_ifrs'
  | 'ifrs_for_smes'
  | 'other_sa_framework'
  | 'grap'
  | 'not_yet_determined';

export type AccountingBasis = 'accrual' | 'cash';

/**
 * How often a VAT-registered vendor files returns. SARS actually assigns
 * vendors to specific categories (A-E) with somewhat different rules per
 * category — simplified to the filing cadence here; the exact category
 * assignment logic is not modeled and would need professional/SARS
 * verification before being relied on (SA_ACCOUNTING_MASTER_SPEC.md §110).
 */
export type VatFilingFrequency = 'monthly' | 'bi_monthly' | 'six_monthly' | 'annual';

/**
 * §11: VAT is generally accounted for on the invoice/accrual basis;
 * the payments basis is available only to qualifying vendors, subject to
 * SARS approval — this field records which basis actually applies to
 * this company, it does not itself determine eligibility.
 */
export type VatAccountingBasis = 'invoice' | 'payments';

/**
 * A company/entity record — the root of Phase 1 "Accounting Core"
 * (docs/SA_ACCOUNTING_MASTER_SPEC.md §2). Deliberately does NOT yet include
 * automatic Public Interest Score calculation (§3) or automatic reporting
 * framework determination — both require verifying the exact Companies
 * Regulations methodology against source legislation, which has not been
 * done. `reportingFramework` is manually set instead, with the override
 * recorded (see setReportingFramework in CompanyService).
 *
 * NOTE on scope: this models ONE company's configuration. True multi-company
 * tenant scoping (§75 — every other record in this app tagged with a
 * companyId, and access control enforced per-company) is NOT implemented —
 * every other domain type (Customer, Invoice, etc.) is still single-tenant.
 * That is a deliberately flagged gap, not a silent omission — see
 * docs/SA_SPEC_GAP_ANALYSIS.md.
 */
export interface Company extends BaseEntity {
  name: string;
  /** CIPC registration number, where applicable. */
  registrationNumber?: string;
  legalEntityType: SALegalEntityType;
  isPublicCompany: boolean;
  isListed: boolean;
  /** Manually flagged pending a real Public Interest Score engine (§3). */
  hasPublicAccountability: boolean;
  /** Manually entered pending a real Public Interest Score engine (§3) — not auto-calculated. */
  publicInterestScore?: number;
  reportingFramework: ReportingFramework;
  /** Set together whenever reportingFramework is changed via an authorized override. */
  reportingFrameworkSetBy?: ID;
  reportingFrameworkSetAt?: ISODateString;
  reportingFrameworkOverrideReason?: string;
  /** 1–12. Combined with financialYearEndDay defines the company's year-end. */
  financialYearEndMonth: number;
  /** 1–31. */
  financialYearEndDay: number;
  accountingBasis: AccountingBasis;
  functionalCurrency: CurrencyCode;
  presentationCurrency: CurrencyCode;
  isVatRegistered: boolean;
  vatRegistrationNumber?: string;
  vatRegistrationDate?: ISODateString;
  vatDeregistrationDate?: ISODateString;
  /** §10/§11: only meaningful while isVatRegistered is true. */
  vatFilingFrequency?: VatFilingFrequency;
  vatAccountingBasis?: VatAccountingBasis;
  incomeTaxNumber?: string;
  isActive: boolean;
}
