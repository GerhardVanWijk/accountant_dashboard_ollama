import { useCallback, useEffect, useState } from 'react';
import type { AccountingPeriod, Company, FixedAsset, ProvisionalTaxPeriod, PublicInterestScore, TaxComputation } from '@/types';
import type { Emp201Report, PayrollReconciliation } from '@/features/employees/services';
import type { VatReconciliation, VatReport } from '@/features/tax/services/vatReportService';
import type { SubledgerReconciliation } from '@/features/accounting/services/subledgerReconciliation';
import { companyService } from '@/features/admin/services';
import { publicInterestScoreService } from '../services';
import { financialYearService, accountingPeriodService, journalEntryService, accountMappingService } from '@/features/accounting/services';
import { reconcileAccountsReceivable, reconcileAccountsPayable } from '@/features/accounting/services/subledgerReconciliation';
import { invoiceService } from '@/services';
import { creditNoteService } from '@/features/sales/services';
import { billService } from '@/features/purchases/services';
import { taxRateService } from '@/features/tax/services';
import { computeVatReport, reconcileVatControlAccounts } from '@/features/tax/services/vatReportService';
import { employeeService, payrollRunService, computeEmp201Report, reconcilePayrollLiabilities } from '@/features/employees/services';
import { provisionalTaxService } from '@/features/tax/provisionalTax/services';
import { taxComputationService } from '@/features/tax/incomeTax/services';
import { fixedAssetService } from '@/features/assets/services';

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}
function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

export interface ComplianceDashboardData {
  company: Company | undefined;
  latestPiScore: PublicInterestScore | undefined;
  vatReport: VatReport | null;
  vatReconciliation: VatReconciliation | null;
  emp201: Emp201Report | null;
  emp201Reconciliation: PayrollReconciliation | null;
  activeEmployeeCount: number;
  openFinancialYearName: string | undefined;
  provisionalTaxPeriod: ProvisionalTaxPeriod | undefined;
  latestTaxComputation: TaxComputation | undefined;
  arReconciliation: SubledgerReconciliation | null;
  apReconciliation: SubledgerReconciliation | null;
  accountingPeriods: AccountingPeriod[];
  fixedAssets: FixedAsset[];
}

/**
 * Drives the Compliance Dashboard (SA_ACCOUNTING_MASTER_SPEC.md §108, §116
 * Phase 11). A read-only aggregation over modules already built in Phases
 * 5-10 plus the new Public Interest Score engine — this hook computes
 * nothing new itself (docs/DO_NOT_BREAK.md: never calculate financial
 * figures inline), it only re-runs each module's own existing, already-
 * tested computation (computeVatReport, computeEmp201Report,
 * reconcileAccountsReceivable/Payable, etc.) for "this month"/"the open
 * financial year" and hands the results to the page.
 */
export function useComplianceDashboard() {
  const [data, setData] = useState<ComplianceDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const now = new Date();
    const periodStart = startOfMonth(now);
    const periodEnd = endOfMonth(now);

    (async () => {
      const [companies, financialYears, accountingPeriods, fixedAssets, activeEmployees] = await Promise.all([
        companyService.getCompanies(),
        financialYearService.getFinancialYears(),
        accountingPeriodService.getPeriods(),
        fixedAssetService.getFixedAssets(),
        employeeService.getActiveEmployees(),
      ]);
      const company = companies[0];
      const openFinancialYear = financialYears.find((fy) => fy.status === 'open') ?? financialYears[0];

      const [
        latestPiScore,
        [invoices, creditNotes, bills, taxRates],
        payrollRuns,
        provisionalTaxPeriod,
        latestTaxComputation,
      ] = await Promise.all([
        company ? publicInterestScoreService.getLatestScore(company.id) : Promise.resolve(undefined),
        Promise.all([invoiceService.getInvoices(), creditNoteService.getCreditNotes(), billService.getBills(), taxRateService.getTaxRates()]),
        payrollRunService.getPayrollRuns(),
        openFinancialYear ? provisionalTaxService.getPeriodForFinancialYear(openFinancialYear.id) : Promise.resolve(undefined),
        openFinancialYear ? taxComputationService.getComputationForFinancialYear(openFinancialYear.id) : Promise.resolve(undefined),
      ]);

      const vatReport = computeVatReport(periodStart, periodEnd, invoices, creditNotes, bills, taxRates);
      const vatReconciliation = await reconcileVatControlAccounts(journalEntryService, accountMappingService, periodStart, periodEnd, vatReport);

      const emp201 = computeEmp201Report(periodStart, periodEnd, payrollRuns);
      const emp201Reconciliation = await reconcilePayrollLiabilities(journalEntryService, accountMappingService, periodStart, periodEnd, emp201);

      const [arReconciliation, apReconciliation] = await Promise.all([
        reconcileAccountsReceivable(journalEntryService, accountMappingService, invoices),
        reconcileAccountsPayable(journalEntryService, accountMappingService, bills),
      ]);

      if (cancelled) return;
      setData({
        company,
        latestPiScore,
        vatReport,
        vatReconciliation,
        emp201,
        emp201Reconciliation,
        activeEmployeeCount: activeEmployees.length,
        openFinancialYearName: openFinancialYear?.name,
        provisionalTaxPeriod,
        latestTaxComputation,
        arReconciliation,
        apReconciliation,
        accountingPeriods,
        fixedAssets,
      });
    })()
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error('Failed to load the Compliance Dashboard'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  return { data, loading, error, refetch };
}
