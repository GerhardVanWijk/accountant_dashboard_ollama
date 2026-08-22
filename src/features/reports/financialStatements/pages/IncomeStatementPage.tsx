import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useFinancialStatementsData } from '../hooks/useFinancialStatementsData';
import { calculateIncomeStatement } from '../services/calculateIncomeStatement';
import { StatementRow, StatementSectionHeader } from '../components/StatementRow';
import { fieldInput, fieldLabel } from '../components/formStyles';

/** Income Statement (Profit & Loss) — proposed route `/reports/income-statement`. */
export function IncomeStatementPage() {
  const { accounts, entries, financialYears, loading, error, refetch } = useFinancialStatementsData();

  const [selectedFinancialYearId, setSelectedFinancialYearId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const sortedFinancialYears = useMemo(
    () => [...financialYears].sort((a, b) => b.endDate.localeCompare(a.endDate)),
    [financialYears],
  );

  // Default the date range to the most recent financial year the first
  // time data arrives — the user can still edit start/end directly for a
  // custom range, or pick a different financial year from the dropdown.
  useEffect(() => {
    if (startDate || endDate || sortedFinancialYears.length === 0) return;
    const latest = sortedFinancialYears[0];
    setSelectedFinancialYearId(latest.id);
    setStartDate(latest.startDate.slice(0, 10));
    setEndDate(latest.endDate.slice(0, 10));
  }, [sortedFinancialYears, startDate, endDate]);

  const handleFinancialYearChange = (financialYearId: string) => {
    setSelectedFinancialYearId(financialYearId);
    const year = sortedFinancialYears.find((y) => y.id === financialYearId);
    if (year) {
      setStartDate(year.startDate.slice(0, 10));
      setEndDate(year.endDate.slice(0, 10));
    }
  };

  const statement = useMemo(() => {
    if (!startDate || !endDate) return null;
    return calculateIncomeStatement(entries, accounts, startDate, endDate);
  }, [entries, accounts, startDate, endDate]);

  if (loading) {
    return <Spinner label="Loading income statement…" />;
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
            <h1 className="text-2xl font-semibold text-text-primary">Income Statement</h1>
            <p className="mt-xs text-sm text-text-secondary">
              Profit & Loss for a chosen period (SA_ACCOUNTING_MASTER_SPEC.md §42). /reports/income-statement
            </p>
          </div>
        </div>

        {sortedFinancialYears.length > 0 && (
          <div className="flex flex-wrap items-end gap-sm">
            <div>
              <label className={fieldLabel} htmlFor="incomeStatementFinancialYear">
                Financial Year
              </label>
              <select
                id="incomeStatementFinancialYear"
                className={fieldInput}
                value={selectedFinancialYearId ?? ''}
                onChange={(e) => handleFinancialYearChange(e.target.value)}
              >
                {sortedFinancialYears.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={fieldLabel} htmlFor="incomeStatementStartDate">
                Start Date
              </label>
              <input
                id="incomeStatementStartDate"
                type="date"
                className={fieldInput}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className={fieldLabel} htmlFor="incomeStatementEndDate">
                End Date
              </label>
              <input
                id="incomeStatementEndDate"
                type="date"
                className={fieldInput}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {sortedFinancialYears.length === 0 && (
        <EmptyState
          title="No financial years yet"
          message="A FinancialYear must exist before an Income Statement can be produced."
        />
      )}

      {statement && (
        <Card>
          <StatementSectionHeader label="Revenue" />
          {statement.revenueLines.length === 0 ? (
            <StatementRow label="No revenue posted in this period" amount={0} indent />
          ) : (
            statement.revenueLines.map((line) => (
              <StatementRow key={line.accountId} label={`${line.code} — ${line.name}`} amount={line.amount} indent />
            ))
          )}
          <StatementRow label="Total Revenue" amount={statement.revenueTotal} isTotal />

          <StatementSectionHeader label="Cost of Goods Sold" />
          {statement.costOfGoodsSoldLines.length === 0 ? (
            <StatementRow label="No cost of goods sold in this period" amount={0} indent isInverted />
          ) : (
            statement.costOfGoodsSoldLines.map((line) => (
              <StatementRow key={line.accountId} label={`${line.code} — ${line.name}`} amount={line.amount} indent isInverted />
            ))
          )}
          <StatementRow label="Total Cost of Goods Sold" amount={statement.costOfGoodsSoldTotal} isTotal isInverted />

          <StatementRow label="Gross Profit" amount={statement.grossProfit} isTotal />

          <StatementSectionHeader label="Operating Expenses" />
          {statement.operatingExpenseLines.length === 0 ? (
            <StatementRow label="No operating expenses in this period" amount={0} indent isInverted />
          ) : (
            statement.operatingExpenseLines.map((line) => (
              <StatementRow key={line.accountId} label={`${line.code} — ${line.name}`} amount={line.amount} indent isInverted />
            ))
          )}
          <StatementRow label="Total Operating Expenses" amount={statement.operatingExpenseTotal} isTotal isInverted />

          <StatementRow label="Profit Before Tax" amount={statement.profitBeforeTax} isTotal />

          <StatementSectionHeader label="Income Tax Expense" />
          {statement.incomeTaxExpenseLines.length === 0 ? (
            <StatementRow label="No income tax expense posted in this period" amount={0} indent isInverted />
          ) : (
            statement.incomeTaxExpenseLines.map((line) => (
              <StatementRow key={line.accountId} label={`${line.code} — ${line.name}`} amount={line.amount} indent isInverted />
            ))
          )}
          <StatementRow label="Total Income Tax Expense" amount={statement.incomeTaxExpenseTotal} isTotal isInverted />

          <StatementRow label="Net Profit After Tax" amount={statement.netProfitAfterTax} isTotal />
        </Card>
      )}

      <p className="text-xs text-text-secondary">
        Not built (out of scope for this pass): Notes to the Financial Statements (§43), Statement of Changes in
        Equity, year-over-year/comparative columns, budget-vs-actual (no Budget entity exists in this app),
        export/PDF/print.
      </p>
    </div>
  );
}
