import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reconcileImportBatch, isFullyReconciled } from './reconciliation';
import { journalEntryService, accountMappingService } from '@/features/accounting/services';
import { openingStockBatchService } from '@/features/inventory/services/openingStockBatchService';
import type { ImportBatch } from './types';

vi.mock('@/features/accounting/services', () => ({
  journalEntryService: { getEntry: vi.fn(), getAccountLedger: vi.fn() },
  accountMappingService: { getAccountId: vi.fn() },
}));
vi.mock('@/features/inventory/services/openingStockBatchService', () => ({
  openingStockBatchService: { getOpeningStockBatch: vi.fn() },
}));

const mockedGetEntry = journalEntryService.getEntry as unknown as ReturnType<typeof vi.fn>;
const mockedGetAccountLedger = journalEntryService.getAccountLedger as unknown as ReturnType<typeof vi.fn>;
const mockedGetAccountId = accountMappingService.getAccountId as unknown as ReturnType<typeof vi.fn>;
const mockedGetOpeningStockBatch = openingStockBatchService.getOpeningStockBatch as unknown as ReturnType<typeof vi.fn>;

function makeBatch(overrides: Partial<ImportBatch> = {}): ImportBatch {
  return {
    id: 'batch_1', companyId: 'co_1', importType: 'ar_opening', sourceSystem: 'generic', fileName: 'ar.csv',
    status: 'completed', rowCount: 1, validCount: 1, warningCount: 0, errorCount: 0, importedCount: 1, updatedCount: 0, skippedCount: 0,
    columnMapping: {}, resultSummary: {}, metadata: {}, uploadedAt: '', createdAt: '', updatedAt: '', ...overrides,
  };
}

describe('reconcileImportBatch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports PASS for a Trial Balance batch whose stored totals already balance', async () => {
    const batch = makeBatch({ importType: 'trial_balance', metadata: { totalDebit: 1000, totalCredit: 1000 } });
    const lines = await reconcileImportBatch(batch);
    expect(lines[0].status).toBe('pass');
    expect(isFullyReconciled(lines)).toBe(true);
  });

  it('reports FAIL for a Trial Balance batch with a real difference', async () => {
    const batch = makeBatch({ importType: 'trial_balance', metadata: { totalDebit: 1000, totalCredit: 900 } });
    const lines = await reconcileImportBatch(batch);
    expect(lines[0].status).toBe('fail');
    expect(isFullyReconciled(lines)).toBe(false);
  });

  it('cross-checks the AR subledger total against what the draft journal actually posted to the control account', async () => {
    mockedGetEntry.mockResolvedValue({
      id: 'draft_1', status: 'draft',
      lines: [
        { id: 'l1', accountId: 'acc_ar', debit: 500, credit: 0 },
        { id: 'l2', accountId: 'acc_obe', debit: 0, credit: 500 },
      ],
    });
    const batch = makeBatch({ importType: 'ar_opening', metadata: { subledgerTotal: 500, arControlAccountId: 'acc_ar' }, resultSummary: { draftRecordId: 'draft_1' } });
    const lines = await reconcileImportBatch(batch);
    expect(lines[0].controlTotal).toBe(500);
    expect(lines[0].status).toBe('pass');
  });

  it('flags a mismatch between the subledger total and what actually posted', async () => {
    mockedGetEntry.mockResolvedValue({ id: 'draft_1', status: 'draft', lines: [{ id: 'l1', accountId: 'acc_ar', debit: 300, credit: 0 }] });
    const batch = makeBatch({ importType: 'ar_opening', metadata: { subledgerTotal: 500, arControlAccountId: 'acc_ar' }, resultSummary: { draftRecordId: 'draft_1' } });
    const lines = await reconcileImportBatch(batch);
    expect(lines[0].status).toBe('fail');
    expect(isFullyReconciled(lines)).toBe(false);
  });

  it('is not_applicable when no journal was ever created for the batch', async () => {
    const batch = makeBatch({ importType: 'ap_opening', metadata: { subledgerTotal: 100 } });
    const lines = await reconcileImportBatch(batch);
    expect(lines[0].status).toBe('not_applicable');
    expect(isFullyReconciled(lines)).toBe(false);
  });

  it('a "subledger_only" AR batch compares against the LIVE control-account balance, not a journal it never created', async () => {
    mockedGetAccountLedger.mockResolvedValue([{ entryId: 'e1', entryNumber: '1', date: '2026-01-01', debit: 500, credit: 0, runningBalance: 500 }]);
    const batch = makeBatch({ importType: 'ar_opening', metadata: { mode: 'subledger_only', subledgerTotal: 500, arControlAccountId: 'acc_ar' } });
    const lines = await reconcileImportBatch(batch);
    expect(mockedGetEntry).not.toHaveBeenCalled();
    expect(lines[0].controlTotal).toBe(500);
    expect(lines[0].status).toBe('pass');
  });

  it('inventory opening: EXPECTED POSTING VALUE while still a draft, not compared against the GL', async () => {
    mockedGetOpeningStockBatch.mockResolvedValue({ id: 'batch_x', status: 'draft', totalCost: 1000 });
    const batch = makeBatch({ importType: 'opening_stock', resultSummary: { draftRecordId: 'batch_x' } });
    const lines = await reconcileImportBatch(batch);
    expect(lines[0].status).toBe('not_applicable');
    expect(lines[0].subledgerTotal).toBe(1000);
    expect(mockedGetAccountId).not.toHaveBeenCalled();
  });

  it('inventory opening: POSTED GL VALUE once the batch is confirmed', async () => {
    mockedGetOpeningStockBatch.mockResolvedValue({ id: 'batch_x', status: 'confirmed', totalCost: 1000 });
    mockedGetAccountId.mockResolvedValue('acc_inventory');
    mockedGetAccountLedger.mockResolvedValue([{ entryId: 'e1', entryNumber: '1', date: '2026-01-01', debit: 1000, credit: 0, runningBalance: 1000 }]);
    const batch = makeBatch({ importType: 'opening_stock', resultSummary: { draftRecordId: 'batch_x' } });
    const lines = await reconcileImportBatch(batch);
    expect(lines[0].controlTotal).toBe(1000);
    expect(lines[0].status).toBe('pass');
  });
});
