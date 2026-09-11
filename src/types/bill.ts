import type { BaseEntity, CurrencyCode, DocumentLineItem, ID, ISODateString } from './common';

export type BillStatus =
  | 'draft'
  | 'awaiting_payment'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'void';

/** A supplier bill (Accounts Payable). */
export interface Bill extends BaseEntity {
  billNumber: string;
  supplierId: ID;
  purchaseOrderId?: ID;
  /**
   * Optional link to the `LeaseContract` this Bill is a VAT-bearing lessor
   * tax invoice for (South African lease VAT architecture — Leases +
   * Payroll integrity audit, PART 4, migration 0087). VAT-bearing lease
   * invoices are captured as an ordinary Bill through this existing AP
   * pipeline — never a blanket rate applied inside lease amortization —
   * so the Bill's VAT is evidence/rate-table-driven and already feeds
   * VAT201 like any other Bill. Coding the Bill's net expense line to the
   * 2460 Lease Payment Clearing account (the same account lease
   * amortization credits for interest+principal) is what makes the two
   * postings net against each other; see the migration's header for the
   * full mechanism. Undefined for the overwhelming majority of Bills,
   * which are not lease-related at all.
   */
  leaseId?: ID;
  /**
   * Optional: which `LeaseAmortizationEntry.periodEnd` this Bill's invoice
   * corresponds to, for a company that tags one Bill per period (migration
   * 0098, FINAL HARDENING PART B). Never a forced/fake match — undefined
   * when the Bill isn't period-specific (spans multiple periods, is an
   * upfront/catch-up charge, or the period hasn't been amortized yet).
   * Only meaningful alongside `leaseId`.
   */
  leasePeriodEnd?: ISODateString;
  issueDate: ISODateString;
  dueDate: ISODateString;
  lineItems: DocumentLineItem[];
  subtotal: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  currency: CurrencyCode;
  status: BillStatus;
  /** Set once postBill() successfully posts the GL entry (debit Expense/VAT Input, credit AP). */
  journalEntryId?: ID;
  notes?: string;
}
