import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { FinancialTableCell } from '@/components/tables/FinancialTableCell';
import { formatCurrency } from '@/utils/formatFinancial';
import { useCashFlowStatement } from '../hooks/useCashFlowStatement';
import { CashFlowSectionTable } from '../components/CashFlowSectionTable';
import { ReconciliationCheck } from '../components/ReconciliationCheck';
import { fieldInput, fieldLabel } from '../components/formStyles';

/**
 * Statement of Cash Flows — INDIRECT method (SA_ACCOUNTING_MASTER_SPEC.md
 * §42). Proposed route: /reports/cash-flow, label "Cash Flow", icon
 * "reports" (reused, same icon the Income Statement/Balance Sheet reports
 * use — this app has no dedicated cash-flow icon in the registry and none
 * is warranted for one more Reports-module page).
 *
 * Explicitly OUT OF SCOPE (per dispatch, see cashFlowStatementService.ts):
 * comparative/YoY columns, cash flow forecasting, a direct-method
 * presentation — indirect method only.
 */
export function CashFlowStatementPage() {
  const [selectedFinancialYearId, setSelectedFinancialYearId] = useState<string | null>(null);
  const { financialYears, statement, loading, error, refetch } = useCashFlowStatement(selectedFinancialYearId);

  const sortedFinancialYears = useMemo(
    () => [...financialYears].sort((a, b) => b.endDate.localeCompare(a.endDate)),
    [financialYears],
  );
  const activeFinancialYearId = selectedFinancialYearId ?? sortedFinancialYears[0]?.id ?? null;
  const activeFinancialYear = sortedFinancialYears.find((y) => y.id === activeFinancialYearId);

  if (loading) {
    return <Spinner label="Loading cash flow statement…" />;
  }
  if (error) {
    return <ErrorState message={error.message} onRetry={refetch} />;
  }

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-sm">
          <Icon name="reports" className="text-text-secondary" size={22} />
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Statement of Cash Flows</h1>
            <p className="mt-xs text-sm text-text-secondary">
              Operating, investing and financing activities — indirect method (§42). /reports/cash-flow
            </p>
          </div>
        </div>

        {sortedFinancialYears.length > 0 && (
          <div>
            <label className={fieldLabel} htmlFor="cashFlowFinancialYear">
              Financial Year
            </label>
            <select
              id="cashFlowFinancialYear"
              className={fieldInput}
              value={activeFinancialYearId ?? ''}
              onChange={(e) => setSelectedFinancialYearId(e.target.value)}
            >
              {sortedFinancialYears.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {sortedFinancialYears.length === 0 && (
        <EmptyState
          title="No financial years yet"
          message="A FinancialYear must exist before a Statement of Cash Flows can be produced."
        />
      )}

      {statement && activeFinancialYear && (
        <>
          <Card>
            <div className="mb-md flex flex-wrap items-center justify-between gap-sm">
              <h2 className="text-sm font-semibold text-text-primary">{activeFinancialYear.name}</h2>
              <span className="text-xs text-text-secondary">
                {activeFinancialYear.startDate.slice(0, 10)} – {activeFinancialYear.endDate.slice(0, 10)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-md tabular-nums md:grid-cols-3">
              <div>
                <p className="text-xs text-text-secondary">Net Profit (period)</p>
                <FinancialNumber value={statement.netProfit} format={formatCurrency} showFlash={false} className="text-lg" />
              </div>
              <div>
                <p className="text-xs text-text-secondary">Net Cash Movement</p>
                <FinancialNumber
                  value={statement.netCashMovement}
                  format={formatCurrency}
                  showFlash={false}
                  className="text-lg"
                />
              </div>
              <div>
                <p className="text-xs text-text-secondary">Actual Cash and Bank Movement</p>
                <FinancialNumber
                  value={statement.actualCashMovement}
                  format={formatCurrency}
                  showFlash={false}
                  className="text-lg"
                />
              </div>
            </div>
          </Card>

          <Card>
            <CashFlowSectionTable title="Operating Activities" section={statement.operating} />
            <CashFlowSectionTable title="Investing Activities" section={statement.investing} />
            <CashFlowSectionTable title="Financing Activities" section={statement.financing} />

            <div className="mt-md grid grid-cols-[1fr_160px] gap-2 border-t-2 border-border px-2 py-sm font-semibold tabular-nums">
              <FinancialTableCell type="label">Net Increase / (Decrease) in Cash</FinancialTableCell>
              <FinancialTableCell type="number">
                <FinancialNumber value={statement.netCashMovement} format={formatCurrency} showFlash={false} />
              </FinancialTableCell>
            </div>
          </Card>

          <Card>
            <h2 className="mb-sm text-sm font-semibold text-text-primary">Reconciliation Check</h2>
            <ReconciliationCheck statement={statement} />
          </Card>
        </>
      )}

      <p className="text-xs text-text-secondary">
        Not built (out of scope for this pass): comparative/prior-year columns, cash flow forecasting, and a
        direct-method presentation — this statement is indirect-method only (§42).
      </p>
    </div>
  );
}
