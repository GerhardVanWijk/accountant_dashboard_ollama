import type { Payment } from '@/types';
import { seedSuppliers } from './suppliers';

function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Seed data for MockPaymentRepository. Each seed payment mirrors an
 * amountPaid figure already present on the corresponding seedBills record
 * (bill_00000001/0002 fully paid, bill_00000003/0012 partially paid) so the
 * Payment Register and Vendor Aging both show something coherent out of the
 * box. These are display-only seed rows created directly in the repository
 * (not run through PaymentService.createPayment()), so — like seedBills —
 * they intentionally carry no journalEntryId: there is no matching seeded
 * GL entry for them, only for payments recorded through the real service.
 */
export const seedPayments: Payment[] = [
  {
    id: 'pay_00000001',
    paymentNumber: 'PAY-2026-0001',
    supplierId: seedSuppliers[0].id,
    date: '2026-07-20',
    method: 'eft',
    reference: 'EFT-100231',
    amount: 77625,
    allocations: [{ billId: 'bill_00000001', amount: 77625 }],
    unallocatedAmount: 0,
    currency: 'ZAR',
    notes: 'Full settlement of BILL-2026-0001',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  },
  {
    id: 'pay_00000002',
    paymentNumber: 'PAY-2026-0002',
    supplierId: seedSuppliers[1].id,
    date: '2026-08-10',
    method: 'eft',
    reference: 'EFT-100255',
    amount: 129375,
    allocations: [{ billId: 'bill_00000002', amount: 129375 }],
    unallocatedAmount: 0,
    currency: 'ZAR',
    notes: 'Full settlement of BILL-2026-0002',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  },
  {
    id: 'pay_00000003',
    paymentNumber: 'PAY-2026-0003',
    supplierId: seedSuppliers[2].id,
    date: '2026-08-15',
    method: 'eft',
    reference: 'EFT-100301',
    amount: 10000,
    allocations: [{ billId: 'bill_00000003', amount: 10000 }],
    unallocatedAmount: 0,
    currency: 'ZAR',
    notes: 'Part payment against BILL-2026-0003',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  },
  {
    id: 'pay_00000004',
    paymentNumber: 'PAY-2026-0004',
    supplierId: seedSuppliers[5].id,
    date: '2026-08-05',
    method: 'card',
    reference: 'CARD-9981',
    amount: 25300,
    allocations: [{ billId: 'bill_00000012', amount: 25300 }],
    unallocatedAmount: 0,
    currency: 'ZAR',
    notes: 'Part payment against BILL-2026-0012',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  },
];
