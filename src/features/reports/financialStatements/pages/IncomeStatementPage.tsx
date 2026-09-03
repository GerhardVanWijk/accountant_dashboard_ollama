import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Button } from '@/components/ui/shadcn/button';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/shadcn/empty';
import { EnumSelect } from '@/components/app/combobox';
import { useFinancialStatementsData } from '../hooks/useFinancialStatementsData';
import { calculateIncomeStatement } from '../services/calculateIncomeStatement';
import { StatementRow, StatementSectionHeader } from '../components/StatementRow';

/**
 * Income Statement (Profit & Loss) — route `/reports/income-statement`.
 * Every figure comes from `calculateIncomeStatement()` — the real
 * authoritative report service (SA_ACCOUNTING_MASTER_SPEC.md §42); this
 * page only formats and lays it out. No comparative/prior-period column is
 * offered: the underlying service computes one period at a time and has no
 * built-in prior-period concept, so adding one here would mean inventing
 * comparison logic in the UI rather than surfacing a real capability (M9).
 * Re-skinned onto v0's PageHeader/SectionCard/Field (M9).
 */
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Income statement"
        description="Profit and loss for a chosen period (SA_ACCOUNTING_MASTER_SPEC.md §42)."
        actions={
          sortedFinancialYears.length > 0 ? (
            <div className="flex flex-wrap items-end gap-2">
              <Field className="w-44">
                <FieldLabel htmlFor="incomeStatementFinancialYear">Financial year</FieldLabel>
                <EnumSelect
                  id="incomeStatementFinancialYear"
                  value={selectedFinancialYearId ?? ''}
                  onValueChange={handleFinancialYearChange}
                  options={sortedFinancialYears.map((year) => ({ value: year.id, label: year.name }))}
                />
              </Field>
              <Field className="w-36">
                <FieldLabel htmlFor="incomeStatementStartDate">Start date</FieldLabel>
                <Input id="incomeStatementStartDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </Field>
              <Field className="w-36">
                <FieldLabel htmlFor="incomeStatementEndDate">End date</FieldLabel>
                <Input id="incomeStatementEndDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </Field>
            </div>
          ) : undefined
        }
      />

      {loading && (
        <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading income statement…</p>
        </div>
      )}
      {!loading && error && (
        <div role="alert" className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error.message}</span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}

      {!loading && !error && sortedFinancialYears.length === 0 && (
        <SectionCard>
          <Empty>
            <EmptyTitle>No financial years yet</EmptyTitle>
            <EmptyDescription>A financial year must exist before an Income Statement can be produced.</EmptyDescription>
          </Empty>
        </SectionCard>
      )}

      {!loading && !error && statement && (
        <SectionCard>
          <StatementSectionHeader label="Revenue" />
          {statement.revenueLines.length === 0 ? (
            <StatementRow label="No revenue posted in this period" amount={0} indent />
          ) : (
            statement.revenueLines.map((line) => <StatementRow key={line.accountId} label={`${line.code} — ${line.name}`} amount={line.amount} indent accountId={line.accountId} />)
          )}
          <StatementRow label="Total Revenue" amount={statement.revenueTotal} isTotal />

          <StatementSectionHeader label="Cost of Goods Sold" />
          {statement.costOfGoodsSoldLines.length === 0 ? (
            <StatementRow label="No cost of goods sold in this period" amount={0} indent />
          ) : (
            statement.costOfGoodsSoldLines.map((line) => <StatementRow key={line.accountId} label={`${line.code} — ${line.name}`} amount={line.amount} indent accountId={line.accountId} />)
          )}
          <StatementRow label="Total Cost of Goods Sold" amount={statement.costOfGoodsSoldTotal} isTotal />

          <StatementRow label="Gross Profit" amount={statement.grossProfit} isTotal />

          <StatementSectionHeader label="Operating Expenses" />
          {statement.operatingExpenseLines.length === 0 ? (
            <StatementRow label="No operating expenses in this period" amount={0} indent />
          ) : (
            statement.operatingExpenseLines.map((line) => <StatementRow key={line.accountId} label={`${line.code} — ${line.name}`} amount={line.amount} indent accountId={line.accountId} />)
          )}
          <StatementRow label="Total Operating Expenses" amount={statement.operatingExpenseTotal} isTotal />

          <StatementRow label="Profit Before Tax" amount={statement.profitBeforeTax} isTotal />

          <StatementSectionHeader label="Income Tax Expense" />
          {statement.incomeTaxExpenseLines.length === 0 ? (
            <StatementRow label="No income tax expense posted in this period" amount={0} indent />
          ) : (
            statement.incomeTaxExpenseLines.map((line) => <StatementRow key={line.accountId} label={`${line.code} — ${line.name}`} amount={line.amount} indent accountId={line.accountId} />)
          )}
          <StatementRow label="Total Income Tax Expense" amount={statement.incomeTaxExpenseTotal} isTotal />

          <StatementRow label="Net Profit After Tax" amount={statement.netProfitAfterTax} isTotal />
        </SectionCard>
      )}

      <p className="text-xs text-muted-foreground">
        Not built (out of scope): Notes to the Financial Statements (§43), Statement of Changes in Equity,
        year-over-year/comparative columns, budget-vs-actual (no Budget entity exists in this app), export/PDF.
      </p>
    </div>
  );
}
