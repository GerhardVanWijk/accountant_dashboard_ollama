import type {
  BankAccount,
  Company,
  CreditNote,
  Customer,
  Invoice,
  Product,
  PurchaseOrder,
  Quote,
  SalesOrder,
  Supplier,
  TaxRate,
} from '@/types';
import type { AdapterContext } from './shared';

/**
 * Deliberately real-looking UUIDs everywhere an id can appear, so
 * `noInternalIds.test.tsx` proves the adapters + template never let one
 * reach the page.
 */
export const UUID = {
  company: '11111111-1111-4111-8111-111111111111',
  customer: '22222222-2222-4222-8222-222222222222',
  supplier: '33333333-3333-4333-8333-333333333333',
  quote: '44444444-4444-4444-8444-444444444444',
  salesOrder: '55555555-5555-4555-8555-555555555555',
  invoice: '66666666-6666-4666-8666-666666666666',
  creditNote: '77777777-7777-4777-8777-777777777777',
  po: '88888888-8888-4888-8888-888888888888',
  line1: '99999999-9999-4999-8999-999999999999',
  line2: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  product: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  taxStd: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  journal: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  bank: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
} as const;

export const company: Company = {
  id: UUID.company,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  name: 'Office National Demo (Pty) Ltd',
  registrationNumber: '2021/456789/07',
  legalEntityType: 'private_company',
  isPublicCompany: false,
  isListed: false,
  hasPublicAccountability: false,
  reportingFramework: 'ifrs_for_smes',
  financialYearEndMonth: 2,
  financialYearEndDay: 28,
  accountingBasis: 'accrual',
  functionalCurrency: 'ZAR',
  presentationCurrency: 'ZAR',
  isVatRegistered: true,
  vatRegistrationNumber: '4990123456',
  incomeTaxNumber: '9012345678',
  isActive: true,
};

/**
 * Phase 4B-2 — the same company WITH a fully populated document profile
 * (migration 0047). `documentsBankAccountId` is a real-looking UUID so the
 * `noInternalIds` scan proves the FK never reaches paper — only the
 * resolved human bank details do. `logo` is a tiny valid PNG data URL.
 */
export const companyWithDocumentProfile: Company = {
  ...company,
  tradingName: 'Office National',
  logo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  documentAddress: {
    line1: '101 Corporate Park',
    line2: 'Block C, 2nd Floor',
    city: 'Pretoria',
    state: 'Gauteng',
    postalCode: '0181',
    country: 'South Africa',
  },
  phone: '+27 12 555 0400',
  email: 'accounts@officenational.example',
  website: 'www.officenational.example',
  documentTerms: 'Payment is due within 30 days of the invoice date. Goods remain our property until paid in full.',
  documentsBankAccountId: UUID.bank,
};

export const customer: Customer = {
  id: UUID.customer,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  customerNumber: 'CUST-0007',
  name: 'FreshMart Retail',
  email: 'accounts@freshmart.example',
  phone: '+27 21 555 0100',
  billingAddress: {
    line1: '14 Long Street',
    city: 'Cape Town',
    state: 'Western Cape',
    postalCode: '8001',
    country: 'South Africa',
  },
  taxNumber: '4100200300',
  currency: 'ZAR',
  balance: 0,
  status: 'active',
  paymentTerms: 'Net30',
  contacts: [{ id: 'contact-1', name: 'Thandi Mokoena', isPrimary: true }],
};

export const supplier: Supplier = {
  id: UUID.supplier,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  supplierNumber: 'SUPP-0003',
  name: 'PaperWorks Wholesale',
  email: 'sales@paperworks.example',
  phone: '+27 11 555 0200',
  address: {
    line1: '2 Industrial Road',
    city: 'Johannesburg',
    postalCode: '2001',
    country: 'South Africa',
  },
  taxNumber: '4200300400',
  currency: 'ZAR',
  balance: 0,
  status: 'active',
  contactPerson: 'Sipho Ndlovu',
};

export const product: Product = {
  id: UUID.product,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  sku: 'A4-PAPER-80',
  name: 'A4 Paper 80gsm (ream)',
  categoryId: 'cat-1',
  type: 'inventory',
  trackInventory: true,
  costPrice: 45,
  sellingPrice: 72,
  reorderPoint: 20,
  quantityOnHand: 500,
  status: 'active',
  uom: 'REAM',
} as unknown as Product;

export const taxRates: TaxRate[] = [
  {
    id: UUID.taxStd,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    code: 'STD',
    name: 'Standard rate',
    treatment: 'standard_rated',
    rate: 15,
    appliesTo: 'both',
    effectiveFrom: '2025-04-01',
    jurisdiction: 'ZA',
    sourceReference: 'VAT Act s7(1)',
    isActive: true,
  },
];

export const bankAccount: BankAccount = {
  id: UUID.bank,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  name: 'Office National Business Cheque',
  bankName: 'First National Bank',
  accountNumber: '62884471059',
  accountType: 'checking',
  currency: 'ZAR',
  openingBalance: 0,
  currentBalance: 0,
  glAccountId: 'gl-1000',
  status: 'active',
  branchCode: '250655',
};

const lineItems = [
  {
    id: UUID.line1,
    productId: UUID.product,
    description: 'A4 Paper 80gsm (ream)',
    quantity: 10,
    unitPrice: 72,
    taxRateId: UUID.taxStd,
    taxAmount: 108,
    lineTotal: 720,
  },
  {
    id: UUID.line2,
    description: 'Delivery to store',
    quantity: 1,
    unitPrice: 150,
    taxRateId: UUID.taxStd,
    taxAmount: 22.5,
    lineTotal: 150,
  },
];

export const quote: Quote = {
  id: UUID.quote,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  quoteNumber: 'QUO-2026-0004',
  customerId: UUID.customer,
  issueDate: '2026-08-01',
  expiryDate: '2026-08-31',
  lineItems,
  subtotal: 870,
  taxTotal: 130.5,
  total: 1000.5,
  currency: 'ZAR',
  status: 'sent',
  notes: 'Thank you for your enquiry.',
};

export const salesOrder: SalesOrder = {
  id: UUID.salesOrder,
  createdAt: '2026-08-05T00:00:00.000Z',
  updatedAt: '2026-08-05T00:00:00.000Z',
  orderNumber: 'SO-2026-0004',
  customerId: UUID.customer,
  quoteId: UUID.quote,
  orderDate: '2026-08-05',
  lineItems,
  subtotal: 870,
  taxTotal: 130.5,
  total: 1000.5,
  currency: 'ZAR',
  status: 'confirmed',
};

export const invoice: Invoice = {
  id: UUID.invoice,
  createdAt: '2026-08-10T00:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
  invoiceNumber: 'INV-2026-1072',
  customerId: UUID.customer,
  salesOrderId: UUID.salesOrder,
  issueDate: '2026-08-10',
  dueDate: '2026-09-09',
  lineItems,
  subtotal: 870,
  taxTotal: 130.5,
  total: 1000.5,
  amountPaid: 400,
  currency: 'ZAR',
  status: 'partially_paid',
  journalEntryId: UUID.journal,
};

export const creditNote: CreditNote = {
  id: UUID.creditNote,
  createdAt: '2026-08-20T00:00:00.000Z',
  updatedAt: '2026-08-20T00:00:00.000Z',
  creditNoteNumber: 'CN-2026-0011',
  customerId: UUID.customer,
  invoiceId: UUID.invoice,
  issueDate: '2026-08-20',
  reason: 'other',
  reasonDetails: 'Goodwill credit after a delivery delay.',
  lineItems: [{ ...lineItems[0], originalInvoiceLineId: UUID.line1 }],
  subtotal: 720,
  taxTotal: 108,
  total: 828,
  amountAllocated: 0,
  currency: 'ZAR',
  status: 'issued',
  allocations: [],
  journalEntryId: UUID.journal,
};

export const purchaseOrder: PurchaseOrder = {
  id: UUID.po,
  createdAt: '2026-08-02T00:00:00.000Z',
  updatedAt: '2026-08-02T00:00:00.000Z',
  poNumber: 'PO-2026-0031',
  supplierId: UUID.supplier,
  orderDate: '2026-08-02',
  expectedDate: '2026-08-16',
  lineItems,
  subtotal: 870,
  taxTotal: 130.5,
  total: 1000.5,
  currency: 'ZAR',
  status: 'sent',
  billId: 'bill-should-never-print',
  journalEntryId: UUID.journal,
};

export function ctx(overrides: Partial<AdapterContext> = {}): AdapterContext {
  return {
    company,
    customer,
    supplier,
    products: new Map([[product.id, product]]),
    taxRates,
    taxRatesPending: false,
    ...overrides,
  };
}
