import type { ID, Invoice } from '@/types';

/**
 * TEMPORARY: superseded once the Sales module (Phase 2) provides real
 * Invoice/CreditNote data. Until then, customer aging and the financial
 * summary cards on the Customer Hub are computed from this small,
 * customers-bee-owned "open items" dataset instead of real transactional
 * records. Nothing outside src/features/customers/ should depend on this
 * shape — it exists purely to drive the aging/financial-summary math this
 * module owns per docs DO_NOT_BREAK.md ("never calculate aging inside
 * JSX — process it via dedicated domain helpers").
 */
export interface OpenItem {
  id: ID;
  customerId: ID;
  /** Human-readable document reference, e.g. "INV-2001". */
  reference: string;
  issueDate: string;
  dueDate: string;
  /** Original document amount (used for YTD sales totals). */
  amount: number;
  /** Remaining unpaid amount (used for aging/outstanding totals); 0 = paid in full. */
  amountOutstanding: number;
}

/**
 * Seed "open items" roughly reconciling to each seeded customer's
 * `balance` in src/mock-data/customers.ts, spread across aging buckets
 * (current / 1-30 / 31-60 / 61+ days) so the aging report and financial
 * summary cards have realistic, varied data to render.
 */
export const mockOpenItems: OpenItem[] = [
  // Acme Trading Co. (cust_00000001) — balance 12500
  { id: 'oi_2001', customerId: 'cust_00000001', reference: 'INV-2001', issueDate: '2026-07-05', dueDate: '2026-08-04', amount: 7500, amountOutstanding: 7500 },
  { id: 'oi_2002', customerId: 'cust_00000001', reference: 'INV-2002', issueDate: '2026-08-10', dueDate: '2026-09-09', amount: 5000, amountOutstanding: 5000 },
  { id: 'oi_1999', customerId: 'cust_00000001', reference: 'INV-1999', issueDate: '2026-02-01', dueDate: '2026-03-03', amount: 9000, amountOutstanding: 0 },

  // Karoo Agri Supplies (cust_00000003) — balance 84200.50, credit hold
  { id: 'oi_2101', customerId: 'cust_00000003', reference: 'INV-2101', issueDate: '2026-04-01', dueDate: '2026-05-01', amount: 30000, amountOutstanding: 30000 },
  { id: 'oi_2102', customerId: 'cust_00000003', reference: 'INV-2102', issueDate: '2026-06-15', dueDate: '2026-07-15', amount: 24200.5, amountOutstanding: 24200.5 },
  { id: 'oi_2103', customerId: 'cust_00000003', reference: 'INV-2103', issueDate: '2026-07-25', dueDate: '2026-08-24', amount: 30000, amountOutstanding: 30000 },

  // Table Mountain Coffee Roasters (cust_00000004) — balance 3150, COD
  { id: 'oi_2901', customerId: 'cust_00000004', reference: 'INV-2901', issueDate: '2026-08-18', dueDate: '2026-08-18', amount: 3150, amountOutstanding: 3150 },

  // Durban Harbour Logistics (cust_00000005) — balance 145800
  { id: 'oi_2201', customerId: 'cust_00000005', reference: 'INV-2201', issueDate: '2026-05-01', dueDate: '2026-06-30', amount: 60000, amountOutstanding: 60000 },
  { id: 'oi_2202', customerId: 'cust_00000005', reference: 'INV-2202', issueDate: '2026-06-01', dueDate: '2026-07-31', amount: 45800, amountOutstanding: 45800 },
  { id: 'oi_2203', customerId: 'cust_00000005', reference: 'INV-2203', issueDate: '2026-07-15', dueDate: '2026-09-13', amount: 40000, amountOutstanding: 40000 },

  // Pretoria Office Solutions (cust_00000007) — balance 27650.75, Net14
  { id: 'oi_2301', customerId: 'cust_00000007', reference: 'INV-2301', issueDate: '2026-07-20', dueDate: '2026-08-03', amount: 12650.75, amountOutstanding: 12650.75 },
  { id: 'oi_2302', customerId: 'cust_00000007', reference: 'INV-2302', issueDate: '2026-08-12', dueDate: '2026-08-26', amount: 15000, amountOutstanding: 15000 },

  // Gqeberha Marine Chandlers (cust_00000008) — balance 61200, credit hold
  { id: 'oi_2401', customerId: 'cust_00000008', reference: 'INV-2401', issueDate: '2026-03-01', dueDate: '2026-03-31', amount: 21200, amountOutstanding: 21200 },
  { id: 'oi_2402', customerId: 'cust_00000008', reference: 'INV-2402', issueDate: '2026-06-01', dueDate: '2026-07-01', amount: 40000, amountOutstanding: 40000 },

  // Stellenbosch Wine Exports (cust_00000009) — balance 9800
  { id: 'oi_2501', customerId: 'cust_00000009', reference: 'INV-2501', issueDate: '2026-08-01', dueDate: '2026-08-31', amount: 9800, amountOutstanding: 9800 },
  { id: 'oi_2499', customerId: 'cust_00000009', reference: 'INV-2499', issueDate: '2026-01-15', dueDate: '2026-02-14', amount: 15000, amountOutstanding: 0 },

  // East London Auto Parts (cust_00000011) — balance 4300.25, inactive
  { id: 'oi_3001', customerId: 'cust_00000011', reference: 'INV-3001', issueDate: '2026-05-01', dueDate: '2026-05-01', amount: 4300.25, amountOutstanding: 4300.25 },

  // Polokwane Building Merchants (cust_00000012) — balance 52900, Net60
  { id: 'oi_2601', customerId: 'cust_00000012', reference: 'INV-2601', issueDate: '2026-05-01', dueDate: '2026-06-30', amount: 22900, amountOutstanding: 22900 },
  { id: 'oi_2602', customerId: 'cust_00000012', reference: 'INV-2602', issueDate: '2026-07-01', dueDate: '2026-08-30', amount: 30000, amountOutstanding: 30000 },

  // Mbombela Hospitality Group (cust_00000013) — balance 18750, Net14
  { id: 'oi_2701', customerId: 'cust_00000013', reference: 'INV-2701', issueDate: '2026-07-30', dueDate: '2026-08-13', amount: 8750, amountOutstanding: 8750 },
  { id: 'oi_2702', customerId: 'cust_00000013', reference: 'INV-2702', issueDate: '2026-08-15', dueDate: '2026-08-29', amount: 10000, amountOutstanding: 10000 },

  // Kimberley Diamond Trading Post (cust_00000014) — balance 96500, credit hold
  { id: 'oi_2801', customerId: 'cust_00000014', reference: 'INV-2801', issueDate: '2026-02-01', dueDate: '2026-03-03', amount: 46500, amountOutstanding: 46500 },
  { id: 'oi_2802', customerId: 'cust_00000014', reference: 'INV-2802', issueDate: '2026-06-20', dueDate: '2026-07-20', amount: 50000, amountOutstanding: 50000 },
];

/** Convenience accessor — all open items belonging to one customer. */
export function getOpenItemsForCustomer(customerId: ID, source: OpenItem[] = mockOpenItems): OpenItem[] {
  return source.filter((item) => item.customerId === customerId);
}

/**
 * Maps real Invoices (Sales module, shipped Wave 1b) into the `OpenItem`
 * shape `calculateAging`/`calculateFinancialSummary` already consume —
 * lets real Invoice data flow through this feature's existing aging math
 * without changing its signature. Only invoices that represent real,
 * outstanding Accounts Receivable are included: drafts never posted to
 * the GL, and voided invoices carry no balance. `amountOutstanding` is
 * `total - amountPaid`, so a partially-paid invoice only contributes what
 * a customer still actually owes.
 */
export function invoicesToOpenItems(invoices: Invoice[]): OpenItem[] {
  return invoices
    .filter((invoice) => invoice.status !== 'draft' && invoice.status !== 'void')
    .map((invoice) => ({
      id: invoice.id,
      customerId: invoice.customerId,
      reference: invoice.invoiceNumber,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      amount: invoice.total,
      amountOutstanding: Math.max(0, invoice.total - invoice.amountPaid),
    }));
}
