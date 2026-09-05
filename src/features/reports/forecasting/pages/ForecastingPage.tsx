import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Amount } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { EnumSelect, SearchableSelect } from '@/components/app/combobox';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/shadcn/toggle-group';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/shadcn/dialog';
import { ExportMenu } from '@/features/export/components/ExportMenu';
import { PrintableReport } from '@/features/export/components/PrintableReport';
import type { ExportColumn, ExportDataset } from '@/features/export/types';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { formatCurrency, formatDate } from '@/lib/app/format';
import { useFinancialStatementsData } from '@/features/reports/financialStatements/hooks/useFinancialStatementsData';
import { useFinancialPlanLines } from '../hooks/useFinancialPlanLines';
import { useFinancialPlanMutations } from '../hooks/useFinancialPlanMutations';
import {
  computeAccountMonthlySeries,
  computeActualByAccountMonth,
  computeForecastRows,
  computeNetResultMonthlySeries,
  computeVarianceEvidence,
  trailingMonths,
  type ForecastAccountRow,
  type VarianceBaseline,
} from '../services';
import { ForecastTrendChart } from '../components/ForecastTrendChart';
import { TopVariancesChart } from '../components/TopVariancesChart';

const MONTH_OPTIONS = [
  { value: '1', label: 'January' }, { value: '2', label: 'February' }, { value: '3', label: 'March' },
  { value: '4', label: 'April' }, { value: '5', label: 'May' }, { value: '6', label: 'June' },
  { value: '7', label: 'July' }, { value: '8', label: 'August' }, { value: '9', label: 'September' },
  { value: '10', label: 'October' }, { value: '11', label: 'November' }, { value: '12', label: 'December' },
];

function varianceToneClass(favourable: boolean | null): string {
  if (favourable === true) return 'text-positive';
  if (favourable === false) return 'text-negative';
  return '';
}

const EXPORT_COLUMNS: ExportColumn<ForecastAccountRow>[] = [
  { key: 'code', header: 'Code', accessor: (r) => r.code },
  { key: 'name', header: 'Account', accessor: (r) => r.name },
  { key: 'budget', header: 'Budget', accessor: (r) => r.budget, align: 'right', total: (rows) => rows.reduce((s, r) => s + r.budget, 0) },
  { key: 'forecast', header: 'Forecast', accessor: (r) => r.forecast, align: 'right', total: (rows) => rows.reduce((s, r) => s + r.forecast, 0) },
  { key: 'actual', header: 'Actual', accessor: (r) => r.actual, align: 'right', total: (rows) => rows.reduce((s, r) => s + r.actual, 0) },
  { key: 'variance', header: 'Variance', accessor: (r) => r.variance, align: 'right', total: (rows) => rows.reduce((s, r) => s + r.variance, 0) },
  {
    key: 'variancePercent',
    header: 'Variance %',
    accessor: (r) => r.variancePercent,
    align: 'right',
    formatForPrint: (r) => (r.variancePercent === null ? '—' : `${r.variancePercent.toFixed(1)}%`),
  },
];

/**
 * Forecasting — Budget vs Forecast vs Actual, route `/reports/forecasting`
 * (Part 11, whole-project completion audit; previously entirely absent).
 * Planning data (migration 0060, `financial_plan_lines`) never posts to the
 * ledger — "Actual" is computed live from the same posted journal lines
 * every other financial report reads (`computeActualByAccountMonth`).
 * Print/Export reuses the existing shared infrastructure (Phase 7) — the
 * printed report is the full account-level table with company header,
 * matching every other report in this app, rather than a bespoke new PDF
 * pipeline; charts are a screen-only aid on top of that same data.
 */
export function ForecastingPage() {
  const { accounts, entries, loading, error, refetch } = useFinancialStatementsData();
  const { budgetLines, forecastLines, loading: plansLoading, error: plansError, refetch: refetchPlans } = useFinancialPlanLines();
  const { upsertPlanLine, isLoading: saving, error: saveError } = useFinancialPlanMutations({ onSuccess: () => refetchPlans() });
  const canEdit = useCanAccess('reports', 'update');
  const canExport = useCanAccess('reports', 'export');

  const [monthRange, setMonthRange] = useState<6 | 12>(6);
  const [varianceBaseline, setVarianceBaseline] = useState<VarianceBaseline>('budget');
  const [drillDownAccountId, setDrillDownAccountId] = useState<string | null>(null);

  const now = useMemo(() => new Date(), []);
  const months = useMemo(() => trailingMonths(now, monthRange), [now, monthRange]);

  const actualByAccountMonth = useMemo(() => computeActualByAccountMonth(entries, accounts), [entries, accounts]);

  const rows = useMemo(
    () => computeForecastRows({ accounts, budgetLines, forecastLines, actualByAccountMonth, months, varianceBaseline }),
    [accounts, budgetLines, forecastLines, actualByAccountMonth, months, varianceBaseline],
  );

  const netSeries = useMemo(
    () => computeNetResultMonthlySeries({ accounts, budgetLines, forecastLines, actualByAccountMonth, months }),
    [accounts, budgetLines, forecastLines, actualByAccountMonth, months],
  );

  const totals = useMemo(
    () => rows.reduce((acc, r) => ({ budget: acc.budget + r.budget, forecast: acc.forecast + r.forecast, actual: acc.actual + r.actual, variance: acc.variance + r.variance }), { budget: 0, forecast: 0, actual: 0, variance: 0 }),
    [rows],
  );

  const drillDownAccount = accounts.find((a) => a.id === drillDownAccountId);
  const drillDownSeries = useMemo(
    () => (drillDownAccountId ? computeAccountMonthlySeries({ accountId: drillDownAccountId, budgetLines, forecastLines, actualByAccountMonth, months }) : []),
    [drillDownAccountId, budgetLines, forecastLines, actualByAccountMonth, months],
  );
  const drillDownEvidence = useMemo(
    () => (drillDownAccountId ? computeVarianceEvidence(entries, accounts, drillDownAccountId, months) : null),
    [drillDownAccountId, entries, accounts, months],
  );
  const drillDownRow = rows.find((r) => r.accountId === drillDownAccountId);

  // Quick entry form state
  const [entryPlanType, setEntryPlanType] = useState<'budget' | 'forecast'>('budget');
  const [entryAccountId, setEntryAccountId] = useState('');
  const [entryYear, setEntryYear] = useState(String(now.getUTCFullYear()));
  const [entryMonth, setEntryMonth] = useState(String(now.getUTCMonth() + 1));
  const [entryAmount, setEntryAmount] = useState('');
  const [entryNotice, setEntryNotice] = useState<string | null>(null);

  async function handleSaveEntry() {
    setEntryNotice(null);
    if (!entryAccountId || !entryAmount.trim()) return;
    await upsertPlanLine({
      planType: entryPlanType,
      accountId: entryAccountId,
      periodYear: Number(entryYear),
      periodMonth: Number(entryMonth),
      amount: Number(entryAmount),
    });
    setEntryNotice(`${entryPlanType === 'budget' ? 'Budget' : 'Forecast'} line saved.`);
    setEntryAmount('');
  }

  const exportDataset: ExportDataset<ForecastAccountRow> = {
    title: 'Forecasting — Budget vs Forecast vs Actual',
    subtitle: `${months[0]?.label ?? ''} – ${months[months.length - 1]?.label ?? ''} · variance vs ${varianceBaseline}`,
    columns: EXPORT_COLUMNS,
    rows,
    filename: `forecasting-${varianceBaseline}-${new Date().toISOString().slice(0, 10)}`,
  };

  const isLoading = loading || plansLoading;
  const anyError = error ?? plansError;

  // Deterministic, evidence-based executive summary — never a fabricated/AI explanation.
  const summarySentence = (() => {
    const baselineTotal = varianceBaseline === 'budget' ? totals.budget : totals.forecast;
    const diff = totals.actual - baselineTotal;
    const pct = baselineTotal !== 0 ? Math.abs((diff / baselineTotal) * 100).toFixed(1) : null;
    const direction = diff === 0 ? 'exactly on' : diff > 0 ? 'above' : 'below';
    return `Over ${months.length === 6 ? 'the last 6 months' : 'the last 12 months'} (${months[0]?.label} – ${months[months.length - 1]?.label}), total Actual net movement across ${rows.length} account${rows.length === 1 ? '' : 's'} was ${formatCurrency(totals.actual)}, ${direction} ${varianceBaseline} (${formatCurrency(baselineTotal)})${pct ? ` — a ${pct}% variance` : ''}.`;
  })();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Forecasting"
        description="Budget vs Forecast vs Actual, by GL account. Planning data never posts to the ledger — Actual is computed live from posted journal entries."
        actions={<ExportMenu dataset={exportDataset} allowed={canExport} />}
      />

      <SectionCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ToggleGroup value={[String(monthRange)]} onValueChange={(v) => { const n = v[0]; if (n === '6' || n === '12') setMonthRange(Number(n) as 6 | 12); }} variant="outline" size="sm">
            <ToggleGroupItem value="6" className="px-3 text-xs aria-pressed:bg-brand aria-pressed:text-brand-foreground">6 months</ToggleGroupItem>
            <ToggleGroupItem value="12" className="px-3 text-xs aria-pressed:bg-brand aria-pressed:text-brand-foreground">12 months</ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup value={[varianceBaseline]} onValueChange={(v) => { const n = v[0]; if (n === 'budget' || n === 'forecast') setVarianceBaseline(n); }} variant="outline" size="sm">
            <ToggleGroupItem value="budget" className="px-3 text-xs aria-pressed:bg-brand aria-pressed:text-brand-foreground">Variance vs Budget</ToggleGroupItem>
            <ToggleGroupItem value="forecast" className="px-3 text-xs aria-pressed:bg-brand aria-pressed:text-brand-foreground">Variance vs Forecast</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </SectionCard>

      {isLoading ? (
        <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading forecasting data…</p>
        </div>
      ) : anyError ? (
        <div role="alert" className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{anyError.message}</span>
          <Button variant="outline" size="sm" onClick={() => { void refetch(); void refetchPlans(); }}>Retry</Button>
        </div>
      ) : (
        <>
          <SectionCard>
            <p className="text-sm text-muted-foreground">{summarySentence}</p>
          </SectionCard>

          <SectionCard>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <FigureBlock label="Budget" value={formatCurrency(totals.budget)} hint="Selected range" />
              <FigureBlock label="Forecast" value={formatCurrency(totals.forecast)} hint="Selected range" />
              <FigureBlock label="Actual" value={formatCurrency(totals.actual)} hint="From posted journals" />
              <FigureBlock
                label="Variance"
                value={formatCurrency(totals.variance)}
                hint={`vs ${varianceBaseline}`}
                tone={totals.variance === 0 ? 'default' : totals.variance > 0 ? 'warning' : 'positive'}
              />
            </div>
          </SectionCard>

          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard>
              <ForecastTrendChart data={netSeries} title="Net Result — Budget vs Forecast vs Actual" />
            </SectionCard>
            <SectionCard>
              <h3 className="mb-3 text-sm font-medium">Largest variances</h3>
              <TopVariancesChart rows={rows} />
            </SectionCard>
          </div>

          <SectionCard>
            <h2 className="mb-3 text-sm font-medium">By account</h2>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No Budget, Forecast, or Actual activity in this range.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs tracking-wide text-muted-foreground uppercase">
                      <th className="py-2 pr-3 font-medium">Account</th>
                      <th className="py-2 pr-3 text-right font-medium">Budget</th>
                      <th className="py-2 pr-3 text-right font-medium">Forecast</th>
                      <th className="py-2 pr-3 text-right font-medium">Actual</th>
                      <th className="py-2 pr-3 text-right font-medium">Variance</th>
                      <th className="py-2 text-right font-medium">Variance %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.accountId} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/30" onClick={() => setDrillDownAccountId(r.accountId)}>
                        <td className="py-2 pr-3">
                          <span className="font-medium text-brand hover:underline">{r.code} — {r.name}</span>
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums"><Amount value={r.budget} plain /></td>
                        <td className="py-2 pr-3 text-right tabular-nums"><Amount value={r.forecast} plain /></td>
                        <td className="py-2 pr-3 text-right tabular-nums"><Amount value={r.actual} plain /></td>
                        <td className={`py-2 pr-3 text-right tabular-nums font-medium ${varianceToneClass(r.favourable)}`}><Amount value={r.variance} plain /></td>
                        <td className={`py-2 text-right tabular-nums ${varianceToneClass(r.favourable)}`}>{r.variancePercent === null ? '—' : `${r.variancePercent.toFixed(1)}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {canEdit && (
            <SectionCard>
              <h2 className="mb-3 text-sm font-medium">Set a Budget or Forecast amount</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Field>
                  <FieldLabel htmlFor="fc-plan-type">Plan</FieldLabel>
                  <EnumSelect id="fc-plan-type" value={entryPlanType} onValueChange={(v) => setEntryPlanType(v as 'budget' | 'forecast')} options={[{ value: 'budget', label: 'Budget' }, { value: 'forecast', label: 'Forecast' }]} />
                </Field>
                <Field className="lg:col-span-2">
                  <FieldLabel htmlFor="fc-account">Account</FieldLabel>
                  <SearchableSelect id="fc-account" value={entryAccountId || null} onChange={(v) => setEntryAccountId(v ?? '')} placeholder="Select account…" searchPlaceholder="Search accounts…" options={accounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="fc-month">Month</FieldLabel>
                  <EnumSelect id="fc-month" value={entryMonth} onValueChange={setEntryMonth} options={MONTH_OPTIONS} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="fc-year">Year</FieldLabel>
                  <Input id="fc-year" type="number" value={entryYear} onChange={(e) => setEntryYear(e.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="fc-amount">Amount</FieldLabel>
                  <Input id="fc-amount" type="number" step="0.01" value={entryAmount} onChange={(e) => setEntryAmount(e.target.value)} />
                </Field>
                <div className="flex items-end">
                  <Button onClick={() => void handleSaveEntry()} disabled={saving || !entryAccountId || !entryAmount.trim()}>
                    {saving ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </div>
              {entryNotice && <p role="status" className="mt-2 text-sm text-status-positive">{entryNotice}</p>}
              {saveError && <p role="alert" className="mt-2 text-sm text-destructive">{saveError.message}</p>}
            </SectionCard>
          )}
        </>
      )}

      <Dialog open={drillDownAccountId != null} onOpenChange={(open) => !open && setDrillDownAccountId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogTitle>{drillDownAccount ? `${drillDownAccount.code} — ${drillDownAccount.name}` : 'Variance detail'}</DialogTitle>
          {drillDownRow && drillDownEvidence && (
            <div className="flex flex-col gap-4 text-sm">
              <div className="grid grid-cols-3 gap-4 rounded-lg border border-border bg-muted/20 p-3">
                <div><div className="text-xs text-muted-foreground">Budget</div><Amount value={drillDownRow.budget} className="font-semibold" /></div>
                <div><div className="text-xs text-muted-foreground">Actual</div><Amount value={drillDownRow.actual} className="font-semibold" /></div>
                <div><div className="text-xs text-muted-foreground">Variance</div><Amount value={drillDownRow.variance} className={`font-semibold ${varianceToneClass(drillDownRow.favourable)}`} /></div>
              </div>

              <div>
                <h4 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Monthly trend</h4>
                <ForecastTrendChart data={drillDownSeries} title="" />
              </div>

              <div>
                <h4 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  What caused this ({drillDownEvidence.entryCount} posted journal line{drillDownEvidence.entryCount === 1 ? '' : 's'})
                </h4>
                {drillDownEvidence.entryCount === 0 ? (
                  <p className="text-muted-foreground">No posted activity for this account in the selected range.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {drillDownEvidence.bySource.map((s) => (
                      <div key={s.source} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                        <span className="capitalize">{s.source} <span className="text-xs text-muted-foreground">({s.count} entr{s.count === 1 ? 'y' : 'ies'})</span></span>
                        <Amount value={s.amount} plain />
                      </div>
                    ))}
                    {drillDownEvidence.largestEntry && (
                      <p className="text-xs text-muted-foreground">
                        Largest single contribution: <Link className="font-medium text-brand hover:underline" to={`/accounting/journals/${drillDownEvidence.largestEntry.entryId}`}>{drillDownEvidence.largestEntry.entryNumber}</Link>{' '}
                        ({formatCurrency(drillDownEvidence.largestEntry.amount)} on {formatDate(drillDownEvidence.largestEntry.date)})
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <PrintableReport dataset={exportDataset} className="hidden print:block" />
    </div>
  );
}
