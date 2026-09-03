import { useMemo } from 'react';
import type {
  CreditNote,
  Invoice,
  Product,
  PurchaseOrder,
  Quote,
  SalesOrder,
} from '@/types';
import { useCompany } from '@/features/admin/hooks/useCompany';
import { useCustomerList } from '@/features/sales/hooks/useCustomerMap';
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { useProducts } from '@/features/inventory/hooks/useProducts';
import { useAllTaxRates } from '@/features/tax/hooks/useTaxRates';
import { useBankAccounts } from '@/features/banking/hooks/useBankAccounts';
import { useInvoices } from '@/features/sales/hooks/useInvoices';
import { useQuotes } from '@/features/sales/hooks/useQuotes';
import { useSalesOrders } from '@/features/sales/hooks/useSalesOrders';
import type { BusinessDocumentViewModel } from '../types';
import { type AdapterContext, resolveDocumentsBankAccount } from '../adapters/shared';
import { quoteToBusinessDocument } from '../adapters/quoteToBusinessDocument';
import { salesOrderToBusinessDocument } from '../adapters/salesOrderToBusinessDocument';
import { invoiceToBusinessDocument } from '../adapters/invoiceToBusinessDocument';
import { creditNoteToBusinessDocument } from '../adapters/creditNoteToBusinessDocument';
import { purchaseOrderToBusinessDocument } from '../adapters/purchaseOrderToBusinessDocument';

export type BusinessDocumentRecordKind =
  | 'quote'
  | 'sales_order'
  | 'invoice'
  | 'credit_note'
  | 'purchase_order';

export type BusinessDocumentInput =
  | { kind: 'quote'; record: Quote | undefined }
  | { kind: 'sales_order'; record: SalesOrder | undefined }
  | { kind: 'invoice'; record: Invoice | undefined }
  | { kind: 'credit_note'; record: CreditNote | undefined }
  | { kind: 'purchase_order'; record: PurchaseOrder | undefined };

export interface UseBusinessDocumentResult {
  viewModel: BusinessDocumentViewModel | null;
  loading: boolean;
  error: string | null;
}

/**
 * Loads everything a printable business document needs — the issuing
 * company, the recipient party (customer or supplier), products (for
 * SKU / unit), tax rates (for the VAT label), the payment bank account,
 * and any referenced source document's human number — and returns the
 * id-free `BusinessDocumentViewModel`.
 *
 * Payment-info sourcing (Phase 4B-2, migration 0047): the invoice payment
 * block uses the bank account the company nominated in Company Settings
 * (`company.documentsBankAccountId`) provided it is still `active`.
 * Otherwise (no pointer, or it points at a deleted / inactive account) the
 * block is omitted — there is no fallback guessing. See
 * docs/BUSINESS_DOCUMENTS.md.
 */
export function useBusinessDocument(input: BusinessDocumentInput): UseBusinessDocumentResult {
  const { kind, record } = input;

  // `?? {}` guards the case (only reachable under vitest module auto-mocks
  // in a consumer's page test) where one of these transitively-used hooks
  // is stubbed to return undefined — the preview simply stays in its
  // loading state there instead of throwing.
  const { company, loading: companyLoading = true, error: companyError = null } = useCompany() ?? {};
  const { customers = [], loading: customersLoading = true, error: customersError = null } =
    useCustomerList() ?? {};
  const { suppliers = [], loading: suppliersLoading = true, error: suppliersError = null } =
    useSuppliers() ?? {};
  const { products = [], loading: productsLoading = true, error: productsError = null } =
    useProducts() ?? {};
  const { taxRates = [], loading: taxRatesLoading = true, error: taxRatesError = null } =
    useAllTaxRates() ?? {};
  const { bankAccounts = [], isLoading: bankLoading = true } = useBankAccounts() ?? {};
  const { invoices = [], loading: invoicesLoading = true } = useInvoices() ?? {};
  const { quotes = [], isLoading: quotesLoading = true } = useQuotes() ?? {};
  const { salesOrders = [], isLoading: salesOrdersLoading = true } = useSalesOrders() ?? {};

  const needsCustomer = kind !== 'purchase_order';
  const needsSupplier = kind === 'purchase_order';

  const productMap = useMemo<Map<string, Product>>(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  const documentsBankAccount = useMemo(
    () => (company ? resolveDocumentsBankAccount(company, bankAccounts) : undefined),
    [company, bankAccounts],
  );

  const loading =
    companyLoading ||
    productsLoading ||
    taxRatesLoading ||
    (needsCustomer && customersLoading) ||
    (needsSupplier && suppliersLoading) ||
    (kind === 'invoice' && (bankLoading || salesOrdersLoading)) ||
    (kind === 'credit_note' && invoicesLoading) ||
    (kind === 'sales_order' && quotesLoading);

  const error =
    companyError?.message ??
    productsError?.message ??
    taxRatesError?.message ??
    (needsCustomer ? (customersError ?? null) : null) ??
    (needsSupplier ? (suppliersError?.message ?? null) : null) ??
    null;

  const viewModel = useMemo<BusinessDocumentViewModel | null>(() => {
    if (loading || error || !record || !company) return null;

    const customer =
      needsCustomer && 'customerId' in record
        ? customers.find((c) => c.id === record.customerId)
        : undefined;
    const supplier =
      needsSupplier && 'supplierId' in record
        ? suppliers.find((s) => s.id === record.supplierId)
        : undefined;

    if (needsCustomer && !customer) return null;
    if (needsSupplier && !supplier) return null;

    const ctx: AdapterContext = {
      company,
      customer,
      supplier,
      products: productMap,
      taxRates,
      taxRatesPending: taxRatesLoading,
      bankAccount: kind === 'invoice' ? documentsBankAccount : undefined,
      originalInvoiceNumber:
        kind === 'credit_note' && (record as CreditNote).invoiceId
          ? invoices.find((i) => i.id === (record as CreditNote).invoiceId)?.invoiceNumber
          : undefined,
      quoteNumber:
        kind === 'sales_order' && (record as SalesOrder).quoteId
          ? quotes.find((q) => q.id === (record as SalesOrder).quoteId)?.quoteNumber
          : undefined,
      salesOrderNumber:
        kind === 'invoice' && (record as Invoice).salesOrderId
          ? salesOrders.find((o) => o.id === (record as Invoice).salesOrderId)?.orderNumber
          : undefined,
    };

    switch (kind) {
      case 'quote':
        return quoteToBusinessDocument(record as Quote, ctx);
      case 'sales_order':
        return salesOrderToBusinessDocument(record as SalesOrder, ctx);
      case 'invoice':
        return invoiceToBusinessDocument(record as Invoice, ctx);
      case 'credit_note':
        return creditNoteToBusinessDocument(record as CreditNote, ctx);
      case 'purchase_order':
        return purchaseOrderToBusinessDocument(record as PurchaseOrder, ctx);
      default:
        return null;
    }
  }, [
    loading,
    error,
    record,
    company,
    needsCustomer,
    needsSupplier,
    customers,
    suppliers,
    productMap,
    taxRates,
    taxRatesLoading,
    documentsBankAccount,
    invoices,
    quotes,
    salesOrders,
    kind,
  ]);

  return { viewModel, loading, error };
}
