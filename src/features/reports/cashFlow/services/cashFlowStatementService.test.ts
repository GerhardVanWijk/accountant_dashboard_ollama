import { describe, it, expect } from 'vitest';
import type { AssetDisposal, JournalEntry } from '@/types';
import { seedAccounts } from '@/mock-data/accounts';
import { computeCashFlowStatement, type CashFlowPeriod } from './cashFlowStatementService';

const PERIOD: CashFlowPeriod = { start: '2026-01-01T00:00:00.000Z', end: '2026-12-31T23:59:59.999Z' };

let seq = 0;
/** Builds a minimal posted JournalEntry — id/entryNumber are irrelevant to the pure compute function. */
function entry(date: string, lines: { accountId: string; debit?: number; credit?: number }[]): JournalEntry {
  seq += 1;
  return {
    id: `je_${seq}`,
    entryNumber: `JE-${seq}`,
    date,
    source: 'test',
    status: 'posted',
    lines: lines.map((l, i) => ({
      id: `je_${seq}_${i}`,
      accountId: l.accountId,
      debit: l.debit ?? 0,
      credit: l.credit ?? 0,
    })),
    createdAt: date,
    updatedAt: date,
  };
}

describe('computeCashFlowStatement', () => {
  it('computes Net Profit as revenue minus all expenses (including Income Tax Expense), scoped to the period', () => {
    const entries: JournalEntry[] = [
      entry('2026-03-01', [{ accountId: 'acc_1100', debit: 20000 }, { accountId: 'acc_4000', credit: 20000 }]), // sale
      entry('2026-03-05', [{ accountId: 'acc_5100', debit: 5000 }, { accountId: 'acc_1000', credit: 5000 }]), // expense
      entry('2026-03-10', [{ accountId: 'acc_5500', debit: 3000 }, { accountId: 'acc_1000', credit: 3000 }]), // income tax expense
      // Outside the period — must be excluded from Net Profit.
      entry('2025-06-01', [{ accountId: 'acc_1000', debit: 99999 }, { accountId: 'acc_4000', credit: 99999 }]),
    ];
    const statement = computeCashFlowStatement(entries, seedAccounts, [], PERIOD);
    expect(statement.netProfit).toBeCloseTo(20000 - 5000 - 3000, 2);
  });

  it('adds back Depreciation and reverses Gain/Loss on Disposal in Operating activities', () => {
    const entries: JournalEntry[] = [
      entry('2026-05-01', [{ accountId: 'acc_5200', debit: 1000 }, { accountId: 'acc_1590', credit: 1000 }]), // depreciation
      // Disposal at a loss: proceeds 1500 < carrying value 2500 -> loss 1000.
      entry('2026-06-01', [
        { accountId: 'acc_1590', debit: 1500 },
        { accountId: 'acc_1000', debit: 1500 },
        { accountId: 'acc_1500', credit: 4000 },
        { accountId: 'acc_5300', debit: 1000 },
      ]),
    ];
    const disposals: AssetDisposal[] = [
      {
        id: 'disp_1',
        assetId: 'asset_1',
        disposalDate: '2026-06-01',
        proceeds: 1500,
        carryingValueAtDisposal: 2500,
        accumulatedDepreciationAtDisposal: 1500,
        gainLoss: -1000,
        journalEntryId: 'je_disposal',
        createdAt: '2026-06-01',
        updatedAt: '2026-06-01',
      },
    ];
    const statement = computeCashFlowStatement(entries, seedAccounts, disposals, PERIOD);
    const byLabel = Object.fromEntries(statement.operating.items.map((i) => [i.label, i.amount]));
    expect(byLabel['Add: Depreciation']).toBeCloseTo(1000, 2);
    expect(byLabel['Add: Loss on Disposal of Assets']).toBeCloseTo(1000, 2);
    expect(byLabel['Less: Gain on Disposal of Assets']).toBeCloseTo(0, 2);
    // The loss is a non-cash reversal in Operating; the real cash effect (proceeds) belongs in Investing.
    const investingByLabel = Object.fromEntries(statement.investing.items.map((i) => [i.label, i.amount]));
    expect(investingByLabel['Proceeds from Disposal of Fixed Assets']).toBeCloseTo(1500, 2);
  });

  it('computes working-capital changes: AR/Inventory increases are outflows, AP increase is an inflow', () => {
    const entries: JournalEntry[] = [
      entry('2026-02-01', [{ accountId: 'acc_1100', debit: 20000 }, { accountId: 'acc_4000', credit: 20000 }]), // AR +20000
      entry('2026-02-15', [{ accountId: 'acc_1000', debit: 15000 }, { accountId: 'acc_1100', credit: 15000 }]), // AR -15000 (net +5000)
      entry('2026-03-01', [{ accountId: 'acc_1200', debit: 8000 }, { accountId: 'acc_2000', credit: 8000 }]), // Inventory +8000, AP +8000
      entry('2026-04-01', [{ accountId: 'acc_2000', debit: 3000 }, { accountId: 'acc_1000', credit: 3000 }]), // AP -3000 (net +5000)
    ];
    const statement = computeCashFlowStatement(entries, seedAccounts, [], PERIOD);
    const byLabel = Object.fromEntries(statement.operating.items.map((i) => [i.label, i.amount]));
    expect(byLabel['Increase / (Decrease) in Accounts Receivable']).toBeCloseTo(-5000, 2);
    expect(byLabel['Increase / (Decrease) in Inventory']).toBeCloseTo(-8000, 2);
    expect(byLabel['Increase / (Decrease) in Accounts Payable']).toBeCloseTo(5000, 2);
  });

  it('classifies Investing activities: acquisitions are debit-only (a disposal credit does not offset them), proceeds come from AssetDisposal records', () => {
    const entries: JournalEntry[] = [
      entry('2026-04-15', [{ accountId: 'acc_1500', debit: 12000 }, { accountId: 'acc_1000', credit: 12000 }]), // acquisition
      // A disposal of a DIFFERENT, unrelated asset in the same period — its credit to acc_1500 must not net against the acquisition above.
      entry('2026-06-01', [
        { accountId: 'acc_1590', debit: 2000 },
        { accountId: 'acc_1000', debit: 4000 },
        { accountId: 'acc_1500', credit: 5000 },
        { accountId: 'acc_4200', credit: 1000 },
      ]),
    ];
    const disposals: AssetDisposal[] = [
      {
        id: 'disp_1',
        assetId: 'asset_b',
        disposalDate: '2026-06-01',
        proceeds: 4000,
        carryingValueAtDisposal: 3000,
        accumulatedDepreciationAtDisposal: 2000,
        gainLoss: 1000,
        journalEntryId: 'je_disposal',
        createdAt: '2026-06-01',
        updatedAt: '2026-06-01',
      },
    ];
    const statement = computeCashFlowStatement(entries, seedAccounts, disposals, PERIOD);
    const byLabel = Object.fromEntries(statement.investing.items.map((i) => [i.label, i.amount]));
    expect(byLabel['Purchase of Fixed Assets']).toBeCloseTo(-12000, 2); // NOT netted down by the disposal's 5000 credit
    expect(byLabel['Proceeds from Disposal of Fixed Assets']).toBeCloseTo(4000, 2);
  });

  it("classifies Financing activities: Owner's Equity direction and dividends net of withholding not yet remitted", () => {
    const entries: JournalEntry[] = [
      entry('2026-01-05', [{ accountId: 'acc_1000', debit: 100000 }, { accountId: 'acc_3000', credit: 100000 }]), // capital contribution
      entry('2026-07-01', [{ accountId: 'acc_3900', debit: 2000 }, { accountId: 'acc_2500', credit: 2000 }]), // dividend declared (non-cash)
      entry('2026-07-15', [
        { accountId: 'acc_2500', debit: 2000 },
        { accountId: 'acc_1000', credit: 1600 },
        { accountId: 'acc_2510', credit: 400 },
      ]), // dividend paid: gross 2000, net-of-withholding 1600 cash out, 400 withheld (not yet remitted)
    ];
    const statement = computeCashFlowStatement(entries, seedAccounts, [], PERIOD);
    const byLabel = Object.fromEntries(statement.financing.items.map((i) => [i.label, i.amount]));
    expect(byLabel["Owner's Equity Movement (Contributions / Drawings)"]).toBeCloseTo(100000, 2);
    // Only the 1600 that actually left via Cash and Bank this period — NOT the full 2000 gross debit to Dividends Payable.
    expect(byLabel['Dividends Paid to Shareholders']).toBeCloseTo(-1600, 2);
    expect(byLabel['Dividends Tax Remitted to SARS']).toBeCloseTo(0, 2);
  });

  it('recognizes the SARS remittance of withheld Dividends Tax as its own real cash outflow in a later period', () => {
    const entries: JournalEntry[] = [
      entry('2026-08-01', [{ accountId: 'acc_2510', debit: 400 }, { accountId: 'acc_1000', credit: 400 }]),
    ];
    const statement = computeCashFlowStatement(entries, seedAccounts, [], PERIOD);
    const byLabel = Object.fromEntries(statement.financing.items.map((i) => [i.label, i.amount]));
    expect(byLabel['Dividends Tax Remitted to SARS']).toBeCloseTo(-400, 2);
    expect(statement.actualCashMovement).toBeCloseTo(-400, 2);
    expect(statement.reconciles).toBe(true);
  });

  it('excludes entries dated before or after the period', () => {
    const entries: JournalEntry[] = [
      entry('2025-12-15', [{ accountId: 'acc_1000', debit: 10000 }, { accountId: 'acc_3000', credit: 10000 }]),
      entry('2027-01-10', [{ accountId: 'acc_1000', debit: 999 }, { accountId: 'acc_3000', credit: 999 }]),
    ];
    const statement = computeCashFlowStatement(entries, seedAccounts, [], PERIOD);
    expect(statement.netCashMovement).toBe(0);
    expect(statement.actualCashMovement).toBe(0);
    expect(statement.reconciles).toBe(true);
  });

  it('ignores a reversed (non-posted) entry', () => {
    const entries: JournalEntry[] = [
      { ...entry('2026-05-01', [{ accountId: 'acc_1000', debit: 5000 }, { accountId: 'acc_4000', credit: 5000 }]), status: 'draft' },
    ];
    const statement = computeCashFlowStatement(entries, seedAccounts, [], PERIOD);
    expect(statement.netProfit).toBe(0);
    expect(statement.actualCashMovement).toBe(0);
  });

  it('flags a variance (reconciles === false) when a cash movement runs through an account this statement does not classify', () => {
    // Real cash paid for VAT (acc_2100) is not one of the three tracked working-capital accounts —
    // this is exactly the documented scope gap: the check should surface it, not silently pass.
    const entries: JournalEntry[] = [
      entry('2026-09-01', [{ accountId: 'acc_2100', debit: 2000 }, { accountId: 'acc_1000', credit: 2000 }]),
    ];
    const statement = computeCashFlowStatement(entries, seedAccounts, [], PERIOD);
    expect(statement.actualCashMovement).toBeCloseTo(-2000, 2);
    expect(statement.netCashMovement).toBeCloseTo(0, 2); // nothing in Operating/Investing/Financing captured the acc_2100 movement
    expect(statement.reconciles).toBe(false);
    expect(statement.variance).toBeCloseTo(2000, 2);
  });

  it('reconciles Operating + Investing + Financing against the actual Cash and Bank movement on a realistic multi-transaction scenario', () => {
    const entries: JournalEntry[] = [
      // Excluded: before the period.
      entry('2025-12-15', [{ accountId: 'acc_1000', debit: 10000 }, { accountId: 'acc_3000', credit: 10000 }]),
      // 1. Owner's capital contribution.
      entry('2026-01-05', [{ accountId: 'acc_1000', debit: 100000 }, { accountId: 'acc_3000', credit: 100000 }]),
      // 2. Credit sale.
      entry('2026-02-10', [{ accountId: 'acc_1100', debit: 20000 }, { accountId: 'acc_4000', credit: 20000 }]),
      // 3. Cash received from customer.
      entry('2026-02-20', [{ accountId: 'acc_1000', debit: 15000 }, { accountId: 'acc_1100', credit: 15000 }]),
      // 4. Cash operating expense.
      entry('2026-03-01', [{ accountId: 'acc_5100', debit: 5000 }, { accountId: 'acc_1000', credit: 5000 }]),
      // 5. Inventory purchased on credit.
      entry('2026-03-15', [{ accountId: 'acc_1200', debit: 8000 }, { accountId: 'acc_2000', credit: 8000 }]),
      // 6. Payment to supplier.
      entry('2026-04-01', [{ accountId: 'acc_2000', debit: 3000 }, { accountId: 'acc_1000', credit: 3000 }]),
      // 7. Fixed asset acquired for cash.
      entry('2026-04-15', [{ accountId: 'acc_1500', debit: 12000 }, { accountId: 'acc_1000', credit: 12000 }]),
      // 8. Depreciation run.
      entry('2026-05-01', [{ accountId: 'acc_5200', debit: 1000 }, { accountId: 'acc_1590', credit: 1000 }]),
      // 9. Disposal of a different, previously-owned asset at a gain.
      entry('2026-06-01', [
        { accountId: 'acc_1590', debit: 2000 },
        { accountId: 'acc_1000', debit: 4000 },
        { accountId: 'acc_1500', credit: 5000 },
        { accountId: 'acc_4200', credit: 1000 },
      ]),
      // 10. Dividend declared (non-cash).
      entry('2026-07-01', [{ accountId: 'acc_3900', debit: 2000 }, { accountId: 'acc_2500', credit: 2000 }]),
      // 11. Dividend paid, net of withholding.
      entry('2026-07-15', [
        { accountId: 'acc_2500', debit: 2000 },
        { accountId: 'acc_1000', credit: 1600 },
        { accountId: 'acc_2510', credit: 400 },
      ]),
      // 12. Dividends Tax remitted to SARS.
      entry('2026-08-01', [{ accountId: 'acc_2510', debit: 400 }, { accountId: 'acc_1000', credit: 400 }]),
      // 14. Income tax paid in cash.
      entry('2026-09-01', [{ accountId: 'acc_5500', debit: 3000 }, { accountId: 'acc_1000', credit: 3000 }]),
      // Excluded: after the period.
      entry('2027-01-10', [{ accountId: 'acc_1000', debit: 999 }, { accountId: 'acc_3000', credit: 999 }]),
    ];
    const disposals: AssetDisposal[] = [
      {
        id: 'disp_1',
        assetId: 'asset_b',
        disposalDate: '2026-06-01',
        proceeds: 4000,
        carryingValueAtDisposal: 3000,
        accumulatedDepreciationAtDisposal: 2000,
        gainLoss: 1000,
        journalEntryId: 'je_disposal',
        createdAt: '2026-06-01',
        updatedAt: '2026-06-01',
      },
    ];

    const statement = computeCashFlowStatement(entries, seedAccounts, disposals, PERIOD);

    expect(statement.netProfit).toBeCloseTo(12000, 2);
    expect(statement.operating.total).toBeCloseTo(4000, 2);
    expect(statement.investing.total).toBeCloseTo(-8000, 2);
    expect(statement.financing.total).toBeCloseTo(98000, 2);
    expect(statement.netCashMovement).toBeCloseTo(94000, 2);
    expect(statement.actualCashMovement).toBeCloseTo(94000, 2);
    expect(statement.variance).toBeCloseTo(0, 2);
    expect(statement.reconciles).toBe(true);
  });
});
