import type {
  Address,
  BankAccount,
  Company,
  Customer,
  DocumentLineItem,
  Product,
  Supplier,
  TaxRate,
} from '@/types';
import { formatCurrency } from '@/lib/app/format';
import type {
  BusinessDocumentBranding,
  BusinessDocumentLine,
  BusinessDocumentLineColumn,
  BusinessDocumentParty,
  BusinessDocumentPaymentInfo,
} from '../types';

/**
 * Shared, pure adapter helpers. Nothing here recomputes an accounting
 * figure — line/document totals are consumed verbatim from what the domain
 * object already stored.
 */

/** The EXACT footer string. Dynamic year via `new Date().getFullYear()` — never hardcoded. */
export function businessDocumentFooterText(now: Date = new Date()): string {
  return `Generated with Vertex Accounting Solutions • ${now.getFullYear()} • All rights reserved.`;
}

/**
 * Trims trailing zeros from a quantity: `2`, `2.5`, `1.25` — never
 * `2.000000`. Up to 3 decimal places.
 */
export function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  return String(Number(value.toFixed(3)));
}

/** Joins an `Address` into printable lines — never passes the raw object through. */
export function addressLines(address: Address | undefined): string[] | undefined {
  if (!address) return undefined;
  const cityLine = `${address.city ?? ''}${address.state ? `, ${address.state}` : ''} ${
    address.postalCode ?? ''
  }`.trim();
  const lines = [address.line1, address.line2, cityLine, address.country].filter(
    (part): part is string => Boolean(part && part.trim()),
  );
  return lines.length > 0 ? lines : undefined;
}

/** The issuing company as a party block. Explicit field-picking — no spread. */
export function issuerParty(
  company: Company,
  opts: { includeIncomeTaxNumber?: boolean } = {},
): BusinessDocumentParty {
  return {
    name: company.name,
    tradingAs: company.tradingName || undefined,
    registrationNumber: company.registrationNumber || undefined,
    vatNumber: company.vatRegistrationNumber || undefined,
    incomeTaxNumber: opts.includeIncomeTaxNumber ? company.incomeTaxNumber || undefined : undefined,
    // Phase 4B-2 — the company document profile (migration 0047). Every
    // field optional; a blank one is simply omitted from the party block.
    addressLines: addressLines(company.documentAddress),
    email: company.email || undefined,
    phone: company.phone || undefined,
    website: company.website || undefined,
  };
}

/**
 * Resolves the terms text for a document: a document-specific override
 * (if the domain object ever carries one — none do today) takes
 * precedence, otherwise the company's default `documentTerms`. Returns
 * `undefined` when neither is set, so the template omits the block.
 */
export function resolveDocumentTerms(
  documentSpecificTerms: string | undefined,
  company: Company,
): string | undefined {
  return documentSpecificTerms?.trim() || company.documentTerms?.trim() || undefined;
}

/**
 * Picks the bank account whose details print in the invoice payment
 * block: the one the company explicitly nominated
 * (`company.documentsBankAccountId`) AND that is still `active`. Anything
 * else — no pointer set, pointer to a deleted / inactive account —
 * resolves to `undefined` and the payment block is omitted cleanly. There
 * is NO "sole active account" fallback.
 *
 * The "same company" dimension is enforced upstream: `useBankAccounts()`
 * is company-scoped at the repository layer and the `BankAccount` domain
 * type carries no `companyId` to re-check here.
 */
export function resolveDocumentsBankAccount(
  company: Company,
  bankAccounts: BankAccount[],
): BankAccount | undefined {
  if (!company.documentsBankAccountId) return undefined;
  return bankAccounts.find(
    (account) => account.id === company.documentsBankAccountId && account.status === 'active',
  );
}

/** A customer as the recipient party block. */
export function customerParty(customer: Customer): BusinessDocumentParty {
  const primaryContact =
    customer.contacts?.find((c) => c.isPrimary)?.name ?? customer.contacts?.[0]?.name;
  return {
    name: customer.name,
    addressLines: addressLines(customer.billingAddress),
    email: customer.email || undefined,
    phone: customer.phone || undefined,
    vatNumber: customer.taxNumber || undefined,
    accountReference: customer.customerNumber || undefined,
    contactPerson: primaryContact || undefined,
  };
}

/** A supplier as the recipient party block (purchase order). */
export function supplierParty(supplier: Supplier): BusinessDocumentParty {
  return {
    name: supplier.name,
    addressLines: addressLines(supplier.address),
    email: supplier.email || undefined,
    phone: supplier.phone || undefined,
    vatNumber: supplier.taxNumber || undefined,
    accountReference: supplier.supplierNumber || undefined,
    contactPerson: supplier.contactPerson || undefined,
  };
}

export interface LineMappingContext {
  products: Map<string, Product>;
  taxRates: TaxRate[];
  taxRatesPending: boolean;
}

/**
 * A concise, document-appropriate VAT label (e.g. "15%", "Zero-rated",
 * "Exempt") — deliberately shorter than the verbose `getTaxRateLabel`
 * dropdown string ("Standard rate — 15%"), matching the VM comment's
 * examples. An unresolvable id is omitted rather than printing "Unknown".
 */
export function vatLabelFor(
  taxRateId: string | undefined,
  ctx: LineMappingContext,
): string | undefined {
  if (!taxRateId) return undefined;
  const rate = ctx.taxRates.find((t) => t.id === taxRateId);
  if (!rate) return undefined;
  if (rate.treatment === 'zero_rated') return 'Zero-rated';
  if (rate.treatment === 'exempt') return 'Exempt';
  if (rate.treatment === 'out_of_scope') return 'Out of scope';
  return Number.isFinite(rate.rate) ? `${rate.rate}%` : rate.name;
}

export interface MappedLines {
  columns: BusinessDocumentLineColumn[];
  lines: BusinessDocumentLine[];
}

/** Maps stored document line items to printable rows + the column set to show. */
export function mapLines(lineItems: DocumentLineItem[], ctx: LineMappingContext): MappedLines {
  const lines: BusinessDocumentLine[] = lineItems.map((li) => {
    const product = li.productId ? ctx.products.get(li.productId) : undefined;
    return {
      description: li.description,
      code: product?.sku || undefined,
      quantity: formatQuantity(li.quantity),
      unit: product?.uom || undefined,
      unitPrice: formatCurrency(li.unitPrice),
      vatLabel: vatLabelFor(li.taxRateId, ctx),
      amount: formatCurrency(li.lineTotal),
    };
  });

  const hasCode = lines.some((l) => l.code);
  const hasUnit = lines.some((l) => l.unit);
  const columns: BusinessDocumentLineColumn[] = [];
  if (hasCode) columns.push('code');
  columns.push('description', 'quantity');
  if (hasUnit) columns.push('unit');
  columns.push('unitPrice', 'vat', 'amount');

  return { columns, lines };
}

/**
 * Branding block. `logoDataUrl` is the company's stored base64 data URL
 * (migration 0047) when set — otherwise undefined and the template falls
 * back to a text wordmark. `issuerDisplayName` prefers the trading name.
 * `footerText` is the fixed global Vertex string — Company Settings can
 * never influence it (no white-labelling).
 */
export function branding(company: Company, now: Date = new Date()): BusinessDocumentBranding {
  return {
    logoDataUrl: company.logo || undefined,
    issuerDisplayName: company.tradingName || company.name,
    footerText: businessDocumentFooterText(now),
  };
}

/**
 * Payment-information block for an invoice. Only produced when the caller
 * resolved exactly one active bank account (see `useBusinessDocument`).
 */
export function paymentInfoFor(
  bankAccount: BankAccount,
  company: Company,
  documentNumber: string,
): BusinessDocumentPaymentInfo {
  return {
    bankName: bankAccount.bankName,
    accountName: company.name,
    accountNumber: bankAccount.accountNumber,
    branchCode: bankAccount.branchCode || undefined,
    swiftCode: bankAccount.swiftCode || undefined,
    reference: documentNumber,
  };
}

/** Only add a meta field when its value is actually present. */
export function metaField(label: string, value: string | undefined | null) {
  return value ? { label, value } : undefined;
}

export interface AdapterContext {
  company: Company;
  customer?: Customer;
  supplier?: Supplier;
  products: Map<string, Product>;
  taxRates: TaxRate[];
  taxRatesPending: boolean;
  bankAccount?: BankAccount;
  /** Resolved human number of the invoice a credit note is raised against. */
  originalInvoiceNumber?: string;
  /** Resolved human number of the quote a sales order came from. */
  quoteNumber?: string;
  /** Resolved human number of the sales order an invoice came from. */
  salesOrderNumber?: string;
  /** Injectable clock for the footer year (tests). */
  now?: Date;
}
