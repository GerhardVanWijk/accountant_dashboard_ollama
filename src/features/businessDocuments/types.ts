/**
 * PHASE 4B — Global Professional Business Documents.
 *
 * `BusinessDocumentViewModel` is the PRIVACY BOUNDARY between the app's
 * domain objects (which carry UUIDs, `*_id` foreign keys, journal-entry
 * ids, posting keys, seed refs, Supabase columns, lifecycle `status`,
 * allocation arrays, …) and the printable A4 template.
 *
 * RULE: this type — and every sub-type on it — is an explicit allow-list of
 * business-facing fields only. It has NO `id`, `*Id`, `journalEntryId`,
 * `companyId`, `createdAt`, `updatedAt`, `status`, `allocations`,
 * `originalInvoiceLineId`, posting key, or seed reference, and never will.
 * The adapters (`adapters/*.ts`) build one of these by picking fields one
 * by one — never by spreading a domain object — so a new internal field on
 * a domain type can never leak onto paper by accident. `noInternalIds.test.tsx`
 * is the regression scan.
 *
 * See `docs/BUSINESS_DOCUMENTS.md`.
 */

export type BusinessDocumentKind =
  | 'quote'
  | 'sales_order'
  | 'tax_invoice'
  | 'invoice'
  | 'credit_note'
  | 'purchase_order';

export interface BusinessDocumentParty {
  name: string;
  tradingAs?: string;
  registrationNumber?: string;
  vatNumber?: string;
  /** Issuer only, and only on a tax invoice / credit note. */
  incomeTaxNumber?: string;
  /** Pre-joined from an `Address` — never the raw object. */
  addressLines?: string[];
  email?: string;
  phone?: string;
  website?: string;
  /** Customer / supplier number — a business-facing reference, OK to print. */
  accountReference?: string;
  contactPerson?: string;
}

export interface BusinessDocumentLine {
  description: string;
  /** SKU — business-facing, OK to print. */
  code?: string;
  /** Formatted, trailing-zero-trimmed. */
  quantity: string;
  /** Product unit of measure — only when the product actually has one. */
  unit?: string;
  /** Formatted currency. */
  unitPrice: string;
  /** e.g. "15%" / "Zero-rated" / "Exempt". */
  vatLabel?: string;
  /** Formatted currency — the line's stored `lineTotal`, excl. VAT. */
  amount: string;
}

export type BusinessDocumentLineColumn =
  | 'code'
  | 'description'
  | 'quantity'
  | 'unit'
  | 'unitPrice'
  | 'vat'
  | 'amount';

export interface BusinessDocumentTotalRow {
  label: string;
  value: string;
  /** The grand total. */
  emphasis?: boolean;
}

export interface BusinessDocumentPaymentInfo {
  bankName: string;
  /** = `company.name` (no account-holder column exists on `bank_accounts`). */
  accountName: string;
  accountNumber: string;
  branchCode?: string;
  swiftCode?: string;
  /** = the document number ("Use INV-2026-1072 as your reference"). */
  reference: string;
}

export interface BusinessDocumentBranding {
  /** Null today — no logo storage exists (Company Settings gap, see docs). */
  logoDataUrl?: string;
  /** `company.name`, rendered as a wordmark when there is no logo. */
  issuerDisplayName: string;
  /** The exact footer string — dynamic year, never hardcoded. */
  footerText: string;
}

export interface BusinessDocumentMetaField {
  label: string;
  value: string;
}

export interface BusinessDocumentViewModel {
  kind: BusinessDocumentKind;
  /** "TAX INVOICE" | "INVOICE" | "QUOTE" | "SALES ORDER" | "CREDIT NOTE" | "PURCHASE ORDER". */
  title: string;
  documentNumber: string;
  /** "Date" | "Issue date" | "Order date" | "Invoice date". */
  issuedOnLabel: string;
  issuedOn: string;
  /** "Due date" | "Valid until" | "Expected delivery". */
  secondaryDateLabel?: string;
  secondaryDate?: string;
  issuer: BusinessDocumentParty;
  recipient: BusinessDocumentParty;
  /** "Bill to" | "Supplier". */
  recipientHeading: string;
  /** Only when a distinct delivery address exists. */
  shipTo?: string[];
  meta: BusinessDocumentMetaField[];
  columns: BusinessDocumentLineColumn[];
  lines: BusinessDocumentLine[];
  totals: BusinessDocumentTotalRow[];
  notes?: string;
  terms?: string;
  paymentInfo?: BusinessDocumentPaymentInfo;
  branding: BusinessDocumentBranding;
  /** Issuer is VAT-registered. */
  isTaxDocument: boolean;
}
