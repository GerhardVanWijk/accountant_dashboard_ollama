import type { ID } from '@/types';

/**
 * TEMPORARY: superseded once Purchases module provides real bill data.
 *
 * There is no real Bill/PO data yet (Purchases module ships in Phase 2).
 * This lightweight "open bills" dataset is owned entirely by
 * suppliers-bee purely so Accounts-Payable aging and the Supplier Detail
 * financial summary have something real to compute against. It is never
 * imported by a component directly — only by this util and
 * supplierService — and must be deleted/replaced once the Purchases
 * module exposes real Bill records with due dates.
 */
export interface MockOpenBill {
  id: string;
  supplierId: ID;
  amount: number;
  issueDate: string; // ISO-8601
  dueDate: string; // ISO-8601
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export const mockOpenBills: MockOpenBill[] = [
  // Highveld Steel — mixed aging, some overdue
  { id: 'bill_mock_001', supplierId: 'sup_00000001', amount: 32500, issueDate: daysAgo(10), dueDate: daysAgo(-20) },
  { id: 'bill_mock_002', supplierId: 'sup_00000001', amount: 21750, issueDate: daysAgo(45), dueDate: daysAgo(15) },
  { id: 'bill_mock_003', supplierId: 'sup_00000001', amount: 30000, issueDate: daysAgo(95), dueDate: daysAgo(65) },

  // Cape Coastal Timber — current only
  { id: 'bill_mock_004', supplierId: 'sup_00000002', amount: 12600.5, issueDate: daysAgo(3), dueDate: daysAgo(-11) },

  // Eskom Business Services — overdue 30 bucket
  { id: 'bill_mock_005', supplierId: 'sup_00000003', amount: 45870.32, issueDate: daysAgo(20), dueDate: daysAgo(6) },

  // City of Johannesburg — current
  { id: 'bill_mock_006', supplierId: 'sup_00000004', amount: 9820, issueDate: daysAgo(5), dueDate: daysAgo(-25) },

  // Sasol Fuel Distributors — on hold, heavily overdue (90+)
  { id: 'bill_mock_007', supplierId: 'sup_00000005', amount: 70000, issueDate: daysAgo(140), dueDate: daysAgo(110) },
  { id: 'bill_mock_008', supplierId: 'sup_00000005', amount: 62400.75, issueDate: daysAgo(80), dueDate: daysAgo(50) },

  // Durban Office Solutions — current
  { id: 'bill_mock_009', supplierId: 'sup_00000006', amount: 3450, issueDate: daysAgo(8), dueDate: daysAgo(-22) },

  // Vaal Logistics & Freight — 60 bucket
  { id: 'bill_mock_010', supplierId: 'sup_00000007', amount: 61200, issueDate: daysAgo(75), dueDate: daysAgo(45) },

  // Pretoria IT Managed Services — current
  { id: 'bill_mock_011', supplierId: 'sup_00000009', amount: 18750, issueDate: daysAgo(6), dueDate: daysAgo(-24) },

  // Nelspruit Agri Equipment — on hold, split 30/90+
  { id: 'bill_mock_012', supplierId: 'sup_00000010', amount: 46430.4, issueDate: daysAgo(50), dueDate: daysAgo(20) },
  { id: 'bill_mock_013', supplierId: 'sup_00000010', amount: 50000, issueDate: daysAgo(130), dueDate: daysAgo(100) },

  // Bloemfontein Cleaning & Hygiene Co. — current
  { id: 'bill_mock_014', supplierId: 'sup_00000011', amount: 2100, issueDate: daysAgo(2), dueDate: daysAgo(-28) },

  // Port Elizabeth Marine Chandlers — 30 bucket
  { id: 'bill_mock_015', supplierId: 'sup_00000012', amount: 27650, issueDate: daysAgo(40), dueDate: daysAgo(10) },

  // Stellenbosch Electrical Wholesalers — current + 60
  { id: 'bill_mock_016', supplierId: 'sup_00000014', amount: 24300.9, issueDate: daysAgo(4), dueDate: daysAgo(-26) },
  { id: 'bill_mock_017', supplierId: 'sup_00000014', amount: 30000, issueDate: daysAgo(70), dueDate: daysAgo(40) },

  // East London Fleet Maintenance — current
  { id: 'bill_mock_018', supplierId: 'sup_00000015', amount: 41250, issueDate: daysAgo(9), dueDate: daysAgo(-19) },
];

export interface AgingBuckets {
  current: number;
  days30: number;
  days60: number;
  days90Plus: number;
  total: number;
}

const EMPTY_BUCKETS: AgingBuckets = { current: 0, days30: 0, days60: 0, days90Plus: 0, total: 0 };

/**
 * Buckets a supplier's open bills into Current / 30 / 60 / 90+ days
 * overdue, based on each bill's due date relative to `asOf`. Pure
 * function — no I/O, no JSX — safe to unit test and to call from
 * supplierService.
 */
export function calculateAging(
  supplierId: ID,
  asOf: Date = new Date(),
  bills: MockOpenBill[] = mockOpenBills,
): AgingBuckets {
  const buckets: AgingBuckets = { ...EMPTY_BUCKETS };

  bills
    .filter((bill) => bill.supplierId === supplierId)
    .forEach((bill) => {
      const dueDate = new Date(bill.dueDate);
      const daysOverdue = Math.floor((asOf.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

      if (daysOverdue <= 0) {
        buckets.current += bill.amount;
      } else if (daysOverdue <= 30) {
        buckets.days30 += bill.amount;
      } else if (daysOverdue <= 60) {
        buckets.days60 += bill.amount;
      } else {
        buckets.days90Plus += bill.amount;
      }
      buckets.total += bill.amount;
    });

  return buckets;
}

/**
 * True when a supplier has any open bill in the (temporary) mock bills
 * dataset. Used by supplierService as the accounts-payable guard against
 * hard-deleting a supplier with linked financial history — re-point this
 * at real Bill/PO/Payment records once the Purchases module ships them.
 */
export function hasOpenBills(supplierId: ID, bills: MockOpenBill[] = mockOpenBills): boolean {
  return bills.some((bill) => bill.supplierId === supplierId);
}
