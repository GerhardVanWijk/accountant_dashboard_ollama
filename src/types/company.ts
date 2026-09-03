import type { Address, BaseEntity, CurrencyCode, ID, ISODateString } from './common';

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
 * Whether the company's annual financial statements are prepared in-house
 * ('internal') or by an independent accounting professional not employed
 * by the company ('independent') — Companies Regulations, 2011, regulations
 * 27-29 turn on this distinction for a company whose Public Interest Score
 * (§3, `src/types/compliance.ts`) falls in specific bands. Manually set,
 * same reason-optional-but-honest pattern as every other compilation-method
 * field in this codebase — not derivable from any data this app has.
 */
export type FinancialStatementCompilation = 'internal' | 'independent';

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
  /**
   * §116 Phase 11 (Compliance)/§3: feeds `publicInterestScoreService`'s
   * audit-vs-independent-review and reporting-framework suggestions for a
   * Public Interest Score in the 100-349 band, or below 100 (Companies
   * Regulations 2011, reg 27-29). Optional/manually set — left unset, the
   * calculation deliberately defaults to the stricter outcome rather than
   * guessing (see `determineAssuranceLevel()`'s doc comment).
   */
  financialStatementsCompilation?: FinancialStatementCompilation;
  isVatRegistered: boolean;
  vatRegistrationNumber?: string;
  vatRegistrationDate?: ISODateString;
  vatDeregistrationDate?: ISODateString;
  /** §10/§11: only meaningful while isVatRegistered is true. */
  vatFilingFrequency?: VatFilingFrequency;
  vatAccountingBasis?: VatAccountingBasis;
  incomeTaxNumber?: string;
  /**
   * §116 Phase 8 (Payroll)/§58: SDL (Skills Development Levy) is not payable
   * by an employer whose total annual leviable payroll is projected to stay
   * below SARS's exemption threshold
   * (PayrollTaxYearConfig.sdlAnnualPayrollExemptionThreshold,
   * src/types/payroll.ts). Modeled here as a single whole-company flag the
   * user sets, rather than payrollRunService projecting a real trailing-
   * 12-month payroll total — a deliberate simplification, see
   * docs/SA_SPEC_GAP_ANALYSIS.md. Defaults to false (not exempt) wherever
   * unset, matching every other boolean flag in this codebase.
   */
  sdlExempt?: boolean;
  /**
   * §116 Phase 9 (Tax)/§53: whether this company qualifies for Small
   * Business Corporation tax treatment. Legislatively, SBC eligibility
   * depends on shareholder composition (only natural persons may hold
   * shares/members' interest), personal-service-company classification,
   * and restrictions on holding shares in other companies (§53) — NONE of
   * which this app models (there is no shareholder register anywhere in
   * this codebase). This flag is therefore a MANUAL, reason-required
   * override an accountant sets only after confirming eligibility
   * themselves, exactly mirroring `reportingFramework` above — it is
   * never auto-determined from gross income or any other figure this app
   * happens to have on hand (that would violate §110's "no unsupported
   * claims" rule). Defaults to undefined/falsy (not eligible) until set.
   */
  isSbcEligible?: boolean;
  /** Set together whenever isSbcEligible is changed via an authorized override — see CompanyService.setSbcEligibility(). */
  sbcEligibilitySetBy?: ID;
  sbcEligibilitySetAt?: ISODateString;
  sbcEligibilityReason?: string;
  isActive: boolean;
  /**
   * Phase 4B-2 (migration 0047 — AUTHORED, NOT APPLIED) — "Document &
   * branding" profile. Every field is optional and nullable in the DB;
   * with all of them unset a printed document renders exactly as it did
   * before this phase (name wordmark, no address block, no contact lines,
   * no default terms, no payment block). See docs/BUSINESS_DOCUMENTS.md.
   */
  /** Trading-as name shown as the document issuer identity; falls back to `name`. */
  tradingName?: string;
  /**
   * Base64 data URL of the company logo for formal documents
   * (`data:image/png;base64,…`). NOT a Storage bucket URL — see migration
   * 0047's header and docs/BUSINESS_DOCUMENTS.md for why. NULL / unset ⇒
   * the trading/legal name is rendered as a text wordmark.
   */
  logo?: string;
  /** Issuer address block on formal documents — the jsonb-Address pattern, same as `Customer.billingAddress`. */
  documentAddress?: Address;
  phone?: string;
  email?: string;
  website?: string;
  /** Default terms & conditions / footer terms printed on quotes, invoices, credit notes and POs. */
  documentTerms?: string;
  /**
   * Which bank account's human details print in the invoice
   * payment-information block. NULL / unset ⇒ the payment block is omitted
   * entirely (no fallback guessing). The id itself is never rendered on a
   * document — only the resolved bank name / account number / branch.
   */
  documentsBankAccountId?: ID;
  /**
   * Phase T (migration 0010) — informational only, surfaced on the
   * Superuser Dashboard's tenant list. Optional here (rather than required
   * like every sibling field) so the ~14 existing test/service files that
   * construct a Company literal don't all need updating for a column
   * nothing in core accounting logic reads; the DB column itself is
   * NOT NULL DEFAULT 'free', so a real row always has one. Nothing in this
   * app enforces tier-gated feature limits yet.
   */
  subscriptionTier?: string;
}
