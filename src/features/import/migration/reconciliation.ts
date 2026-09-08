import { journalEntryService, accountMappingService } from '@/features/accounting/services';
import { openingStockBatchService } from '@/features/inventory/services/openingStockBatchService';
import type { ImportBatch } from './types';

export interface ReconciliationLine {
  label: string;
  subledgerTotal: number;
  controlTotal: number;
  difference: number;
  status: 'pass' | 'fail' | 'not_applicable';
  detail?: string;
}

/** Half a rand, matching subledgerReconciliation.ts's own VARIANCE_EPSILON. */
const EPSILON = 0.02;

function statusFor(difference: number): 'pass' | 'fail' {
  return Math.abs(difference) <= EPSILON ? 'pass' : 'fail';
}

/**
 * Batch-scoped reconciliation (Part 41/42) — compares what THIS
 * migration's own opening-balance journal (draft or, once a human reviews
 * and posts it, posted) actually carries on the relevant control account
 * against the subledger total the adapter computed at execute time
 * (`batch.metadata`/`batch.resultSummary`). This is deliberately NOT the
 * same thing as `subledgerReconciliation.ts`'s whole-company
 * reconcileAccountsReceivable()/reconcileAccountsPayable() (those read
 * from the real Invoice/Bill/CreditNote/Receipt tables, which an opening
 * balance migration never writes to, by design — see arOpeningImportAdapter's
 * doc comment). Once the draft posts, the WHOLE-company control account
 * balance naturally includes this migration's contribution, and the
 * existing whole-company reconciliation continues to be the source of
 * truth for ongoing operations — this function only answers "did THIS
 * migration go in cleanly."
 */
export async function reconcileImportBatch(batch: ImportBatch): Promise<ReconciliationLine[]> {
  const lines: ReconciliationLine[] = [];
  const metadata = batch.metadata as Record<string, unknown>;
  const draftId = (batch.resultSummary as Record<string, unknown>)?.draftRecordId as string | undefined;

  if (batch.importType === 'trial_balance') {
    const totalDebit = Number(metadata?.totalDebit ?? 0);
    const totalCredit = Number(metadata?.totalCredit ?? 0);
    const difference = totalDebit - totalCredit;
    lines.push({ label: 'Trial Balance', subledgerTotal: totalDebit, controlTotal: totalCredit, difference, status: statusFor(difference), detail: `Debit R${totalDebit.toFixed(2)} vs Credit R${totalCredit.toFixed(2)}` });
    return lines;
  }

  if (batch.importType === 'ar_opening' || batch.importType === 'ap_opening') {
    const label = batch.importType === 'ar_opening' ? 'Accounts Receivable' : 'Accounts Payable';
    const direction = batch.importType === 'ar_opening' ? 1 : -1;
    const subledgerTotal = Number(metadata?.subledgerTotal ?? 0);
    const controlAccountId = (metadata?.arControlAccountId ?? metadata?.apControlAccountId) as string | undefined;
    const mode = (metadata?.mode as string | undefined) ?? (draftId ? 'control_and_subledger' : undefined);

    if (mode === 'subledger_only' && controlAccountId) {
      // No journal of this batch's own to compare against — this batch's
      // premise is that a (separate) Trial Balance import already carries
      // the control balance, so the honest check is against the LIVE
      // control-account balance, not a journal this batch never created.
      const ledger = await journalEntryService.getAccountLedger(controlAccountId);
      const controlTotal = ledger.length > 0 ? ledger[ledger.length - 1].runningBalance : 0;
      const difference = subledgerTotal - controlTotal;
      lines.push({
        label: `${label} (subledger detail only — no GL entry from this batch)`,
        subledgerTotal,
        controlTotal,
        difference,
        status: statusFor(difference),
        detail: 'Compared against the live control-account balance (expected to come from a separate Trial Balance import).',
      });
      return lines;
    }

    if (!draftId || !controlAccountId) {
      lines.push({ label, subledgerTotal, controlTotal: 0, difference: subledgerTotal, status: 'not_applicable', detail: 'No opening journal was created for this batch.' });
      return lines;
    }
    const entry = await journalEntryService.getEntry(draftId);
    const controlTotal = (entry?.lines ?? [])
      .filter((l) => l.accountId === controlAccountId)
      .reduce((sum, l) => sum + (l.debit - l.credit) * direction, 0);
    const difference = subledgerTotal - controlTotal;
    lines.push({
      label,
      subledgerTotal,
      controlTotal,
      difference,
      status: statusFor(difference),
      detail: entry?.status === 'posted' ? 'Journal posted.' : 'Journal is still a draft — post it from Journals to complete this migration.',
    });
    return lines;
  }

  if (batch.importType === 'opening_stock') {
    // Requirement 4 (accounting safety review) — openingStockImportAdapter.ts
    // itself is unchanged (its own draft/confirm safety is preserved); this
    // is a READ-ONLY report over the same OpeningStockBatch + Inventory
    // control account it already produces.
    if (!draftId) {
      lines.push({ label: 'Inventory Opening Stock', subledgerTotal: 0, controlTotal: 0, difference: 0, status: 'not_applicable', detail: 'No opening stock batch was created for this import.' });
      return lines;
    }
    const openingBatch = await openingStockBatchService.getOpeningStockBatch(draftId);
    if (!openingBatch) {
      lines.push({ label: 'Inventory Opening Stock', subledgerTotal: 0, controlTotal: 0, difference: 0, status: 'not_applicable', detail: 'The opening stock batch could not be found (it may have been deleted while still a draft).' });
      return lines;
    }
    const expectedValue = openingBatch.totalCost;
    if (openingBatch.status !== 'confirmed') {
      lines.push({
        label: 'Inventory Opening Stock',
        subledgerTotal: expectedValue,
        controlTotal: 0,
        difference: expectedValue,
        status: 'not_applicable',
        detail: `EXPECTED POSTING VALUE R${expectedValue.toFixed(2)} — this batch is still a draft and has not posted to the Inventory GL account yet. Confirm it from Opening Stock to compare against the POSTED GL value.`,
      });
      return lines;
    }
    const inventoryAccountId = await accountMappingService.getAccountId('INVENTORY');
    const ledger = await journalEntryService.getAccountLedger(inventoryAccountId);
    const postedValue = ledger.length > 0 ? ledger[ledger.length - 1].runningBalance : 0;
    const difference = expectedValue - postedValue;
    lines.push({
      label: 'Inventory Opening Stock',
      subledgerTotal: expectedValue,
      controlTotal: postedValue,
      difference,
      status: statusFor(difference),
      detail: `POSTED GL VALUE — Inventory control account balance after this batch's posting.`,
    });
    return lines;
  }

  return lines;
}

/** True only when every reconciliation line for this batch passes (Part 41: "do not declare migration complete when control accounts do not reconcile"). An empty/not-applicable result is never treated as a pass. */
export function isFullyReconciled(lines: ReconciliationLine[]): boolean {
  return lines.length > 0 && lines.every((l) => l.status === 'pass');
}
