import { useCallback, useEffect, useState } from 'react';
import { journalEntryService, accountMappingService } from '../services';
import { reconcileAccountsReceivable, reconcileAccountsPayable, reconcileCustomerDeposits, type SubledgerReconciliation } from '../services/subledgerReconciliation';
import { invoiceService } from '@/services';
import { creditNoteService, customerReceiptService } from '@/features/sales/services';
import { billService, paymentService } from '@/features/purchases/services';

export interface UseSubledgerReconciliationResult {
  ar: SubledgerReconciliation | null;
  ap: SubledgerReconciliation | null;
  /** Customer Deposits (2600) control vs Σ unapplied customer receipts — null when there is nothing on account. */
  deposits: SubledgerReconciliation | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Drives the Trial Balance page's "Subledger Reconciliation" card —
 * SA_ACCOUNTING_MASTER_SPEC.md §17/§70/§71's requirement that Accounts
 * Receivable/Payable subledgers reconcile to their GL control account,
 * with any variance surfaced rather than silently going undetected (see
 * docs/KNOWN_ISSUES.md).
 */
export function useSubledgerReconciliation(): UseSubledgerReconciliationResult {
  const [ar, setAr] = useState<SubledgerReconciliation | null>(null);
  const [ap, setAp] = useState<SubledgerReconciliation | null>(null);
  const [deposits, setDeposits] = useState<SubledgerReconciliation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      invoiceService.getInvoices(),
      billService.getBills(),
      creditNoteService.getCreditNotes(),
      customerReceiptService.getReceipts(),
      paymentService.getPayments(),
    ])
      .then(([invoices, bills, creditNotes, receipts, payments]) =>
        Promise.all([
          reconcileAccountsReceivable(journalEntryService, accountMappingService, invoices, creditNotes, receipts),
          reconcileAccountsPayable(journalEntryService, accountMappingService, bills, payments),
          receipts.some((r) => r.unallocatedAmount > 0)
            ? reconcileCustomerDeposits(journalEntryService, accountMappingService, receipts).catch(() => null)
            : Promise.resolve(null),
        ]),
      )
      .then(([arResult, apResult, depositsResult]) => {
        if (cancelled) return;
        setAr(arResult);
        setAp(apResult);
        setDeposits(depositsResult);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error('Failed to reconcile subledgers'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  return { ar, ap, deposits, loading, error, refetch };
}
