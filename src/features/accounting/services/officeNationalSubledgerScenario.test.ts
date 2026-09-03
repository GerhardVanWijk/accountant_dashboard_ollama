import { describe, expect, it } from 'vitest';
import type { AccountMapper } from './accountMappingService';
import type { JournalEntryService } from './journalEntryService';
import { reconcileAccountsReceivable, reconcileAccountsPayable, reconcileCustomerDeposits } from './subledgerReconciliation';
import {
  officeNationalInvoices,
  officeNationalBills,
  officeNationalCreditNotes,
  officeNationalReceipts,
  officeNationalPayments,
  ON_REAL_AR_CONTROL_BALANCE,
  ON_REAL_AP_CONTROL_BALANCE,
  ON_REAL_CUSTOMER_DEPOSITS_BALANCE,
  ON_NONBILL_AP_ADJUSTMENTS,
  ON_AR_CONTROL_ACCOUNT_ID,
  ON_AP_CONTROL_ACCOUNT_ID,
  ON_CUSTOMER_DEPOSITS_CONTROL_ACCOUNT_ID,
} from './officeNationalSubledgerScenario';

/**
 * Runs the REAL `reconcileAccountsReceivable()` / `reconcileAccountsPayable()`
 * over a fixture of the REAL live Office National Demo documents (invoices /
 * bills / credit notes / receipts / payments — verbatim, INCLUDING the
 * Phase 21.2 part-D seed correction), with the GL control-account balances
 * stubbed to their documented clean values (GL 1100 = R207,794.04,
 * GL 2000 = R590,511.21).
 *
 * Both sides reconcile to ~R0 (Increment 4A split posting):
 *
 *   AR: GL-consistent subledger = Σ posted-invoice.total
 *       − Σ receipt-amount-APPLIED-to-invoices − Σ issued-CN.total
 *       = 668,036.17 − (457,231.23 − 1,750.00) − 3,010.90 = 209,544.04
 *       = GL 1100, exact. The aging subledger (R209,817.80) bridges to it
 *       by just R273.76 un-absorbable credit-note over-allocations
 *       (CN-1002 R141.51 + CN-1005 R132.25) + R0.00 other. The R1,750.00 of
 *       unapplied receipts now sits in Customer Deposits (2600), reconciled
 *       by reconcileCustomerDeposits().
 *
 *   AP: GL-consistent subledger = Σ posted-bill.total − Σ payment.amount
 *       + R363,400.00 non-bill AP (R368,000 vehicle-on-credit − R4,600
 *       duplicate-posting training fault) = 590,511.21 = GL 2000, exact.
 */

function stubLedger(balance: number): Pick<JournalEntryService, 'getAccountLedger'> {
  return {
    getAccountLedger: async () =>
      [{ runningBalance: balance }] as Awaited<ReturnType<JournalEntryService['getAccountLedger']>>,
  };
}

const accountMapper: AccountMapper = {
  getAccountId: async (key: string) =>
    key === 'AR'
      ? ON_AR_CONTROL_ACCOUNT_ID
      : key === 'CUSTOMER_DEPOSIT'
        ? ON_CUSTOMER_DEPOSITS_CONTROL_ACCOUNT_ID
        : ON_AP_CONTROL_ACCOUNT_ID,
} as AccountMapper;

const sum = (ns: number[]) => Math.round(ns.reduce((a, b) => a + b, 0) * 100) / 100;

describe('Office National subledger reconciliation — real live figures (Phase 21.2)', () => {
  it('carries the real dataset shape', () => {
    expect(officeNationalInvoices).toHaveLength(65);
    expect(officeNationalBills).toHaveLength(31);
    expect(officeNationalCreditNotes).toHaveLength(6);
    expect(officeNationalReceipts).toHaveLength(34);
    expect(officeNationalPayments).toHaveLength(22);
  });

  it('the fixture totals match the live figures the reconciliation depends on', () => {
    const postedInvoiceTotal = sum(
      officeNationalInvoices.filter((i) => i.status !== 'draft' && i.status !== 'void').map((i) => i.total),
    );
    expect(postedInvoiceTotal).toBeCloseTo(668_036.17, 2);
    expect(sum(officeNationalReceipts.map((r) => r.amount))).toBeCloseTo(457_231.23, 2);
    expect(sum(officeNationalReceipts.map((r) => r.unallocatedAmount))).toBeCloseTo(1_750.0, 2);
    expect(sum(officeNationalCreditNotes.map((c) => c.total))).toBeCloseTo(3_010.9, 2);
    expect(sum(officeNationalCreditNotes.map((c) => c.total - c.amountAllocated))).toBeCloseTo(273.76, 2);

    const postedBillTotal = sum(
      officeNationalBills.filter((b) => b.status !== 'draft' && b.status !== 'void').map((b) => b.total),
    );
    expect(postedBillTotal).toBeCloseTo(585_641.77, 2);
    expect(sum(officeNationalPayments.map((p) => p.amount))).toBeCloseTo(358_530.56, 2);
  });

  it('AR: reconciles to ~R0 with the bridge decomposed as money-on-account + un-absorbable credit', async () => {
    const result = await reconcileAccountsReceivable(
      stubLedger(ON_REAL_AR_CONTROL_BALANCE),
      accountMapper,
      officeNationalInvoices,
      officeNationalCreditNotes,
      officeNationalReceipts,
    );

    expect(result.controlAccountBalance).toBeCloseTo(ON_REAL_AR_CONTROL_BALANCE, 2);
    expect(result.subledgerTotal).toBeCloseTo(209_544.04, 2);
    expect(result.agingSubledgerTotal).toBeCloseTo(209_817.8, 2);
    expect(result.variance).toBeCloseTo(0, 2);
    expect(result.isReconciled).toBe(true);

    // Unapplied receipts no longer bridge AR — they sit in Customer Deposits.
    expect(result.bridge.unallocatedReceipts).toBeCloseTo(1_750.0, 2); // informational only
    expect(result.bridge.creditNoteImpact).toBeCloseTo(273.76, 2);
    expect(result.bridge.other).toBeCloseTo(0, 2);
  });

  it('Customer Deposits (2600): the GL liability equals Σ unapplied receipts', async () => {
    const result = await reconcileCustomerDeposits(
      stubLedger(ON_REAL_CUSTOMER_DEPOSITS_BALANCE),
      accountMapper,
      officeNationalReceipts,
    );

    expect(result.controlAccountBalance).toBeCloseTo(1_750.0, 2);
    expect(result.subledgerTotal).toBeCloseTo(1_750.0, 2);
    expect(result.variance).toBeCloseTo(0, 2);
    expect(result.isReconciled).toBe(true);
  });

  it('AP: reconciles to ~R0 once the non-bill AP adjustment is supplied', async () => {
    const result = await reconcileAccountsPayable(
      stubLedger(ON_REAL_AP_CONTROL_BALANCE),
      accountMapper,
      officeNationalBills,
      officeNationalPayments,
      ON_NONBILL_AP_ADJUSTMENTS,
    );

    expect(result.controlAccountBalance).toBeCloseTo(ON_REAL_AP_CONTROL_BALANCE, 2);
    expect(result.subledgerTotal).toBeCloseTo(590_511.21, 2);
    expect(result.agingSubledgerTotal).toBeCloseTo(227_111.21, 2);
    expect(result.variance).toBeCloseTo(0, 2);
    expect(result.isReconciled).toBe(true);
  });

  it('AP: WITHOUT the non-bill AP adjustment, the vehicle-on-credit liability shows as the expected variance', async () => {
    const result = await reconcileAccountsPayable(
      stubLedger(ON_REAL_AP_CONTROL_BALANCE),
      accountMapper,
      officeNationalBills,
      officeNationalPayments,
    );

    expect(result.variance).toBeCloseTo(363_400.0, 2);
    expect(result.isReconciled).toBe(false);
  });
});
