import { useCallback, useEffect, useState } from 'react';
import { invoiceService } from '@/services';
import { creditNoteService } from '@/features/sales/services';
import { billService } from '@/features/purchases/services';
import { journalEntryService, accountMappingService } from '@/features/accounting/services';
import { taxRateService } from '../services';
import { computeVatReport, reconcileVatControlAccounts, type VatReconciliation, type VatReport } from '../services/vatReportService';

export interface UseVatReportResult {
  report: VatReport | null;
  reconciliation: VatReconciliation | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Drives the VAT Return page: fetches real Invoices/Credit Notes/Bills and
 * every TaxRate ever created (historical versions included, so an older
 * document's rate still resolves), computes the period's Output/Input VAT
 * (computeVatReport), and reconciles it against what was actually posted
 * to the VAT Output/Input control accounts (reconcileVatControlAccounts).
 */
export function useVatReport(periodStart: Date, periodEnd: Date): UseVatReportResult {
  const [report, setReport] = useState<VatReport | null>(null);
  const [reconciliation, setReconciliation] = useState<VatReconciliation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      invoiceService.getInvoices(),
      creditNoteService.getCreditNotes(),
      billService.getBills(),
      taxRateService.getTaxRates(),
    ])
      .then(([invoices, creditNotes, bills, allTaxRates]) => {
        if (cancelled) return;
        const computed = computeVatReport(periodStart, periodEnd, invoices, creditNotes, bills, allTaxRates);
        setReport(computed);
        return reconcileVatControlAccounts(journalEntryService, accountMappingService, periodStart, periodEnd, computed);
      })
      .then((recon) => {
        if (!cancelled && recon) setReconciliation(recon);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error('Failed to compute VAT report'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodStart.getTime(), periodEnd.getTime(), reloadToken]);

  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  return { report, reconciliation, loading, error, refetch };
}
