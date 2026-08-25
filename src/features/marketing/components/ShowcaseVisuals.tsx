import { CheckIcon, SparklesIcon, TriangleAlertIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** Ported verbatim from accounting-v0-frontend/components/landing/showcase-visuals.tsx. */
function Frame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div aria-hidden="true" className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card/50 shadow-xl shadow-black/30">
      <div className="flex items-center gap-2 border-b border-border/70 px-4 py-2.5">
        <span className="size-1.5 rounded-full bg-brand" />
        <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">{label}</span>
      </div>
      <div className="flex flex-col gap-4 p-4 md:p-5">{children}</div>
    </div>
  );
}

const forecast = [28, 41, 34, 52, 45, 64, 57, 78, 70, 95];

export function DashboardVisual() {
  return (
    <Frame label="Dashboard / cashflow">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Projected cash, 90 days</span>
          <span className="text-2xl font-semibold tracking-tight">R 1 042 380</span>
        </div>
        <span className="rounded-full bg-brand-muted px-2 py-1 text-[11px] font-medium text-brand">Healthy</span>
      </div>

      <div className="flex h-32 items-end gap-1.5">
        {forecast.map((height, i) => (
          <span key={i} className={i > 6 ? 'flex-1 rounded-t-sm bg-brand/40' : 'flex-1 rounded-t-sm bg-brand'} style={{ height: `${height}%` }} />
        ))}
      </div>

      <div className="flex flex-col gap-2 border-t border-border/70 pt-4">
        <span className="text-[11px] font-medium">Aged receivables</span>
        {[
          { label: 'Current', value: 'R 186 400', width: '62%' },
          { label: '30 days', value: 'R 92 110', width: '32%' },
          { label: '60+ days', value: 'R 62 710', width: '21%' },
        ].map((row) => (
          <div key={row.label} className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-[10px] text-muted-foreground">{row.label}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-brand" style={{ width: row.width }} />
            </span>
            <span className="w-20 shrink-0 text-right text-[10px] tabular-nums">{row.value}</span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

const statementLines = [
  { desc: 'EFT — Sithole Retail', amount: 'R 24 850', match: 'INV-1042', confidence: '99%' },
  { desc: 'Card — Engen Rivonia', amount: 'R 1 240', match: 'Fuel expense', confidence: '96%' },
  { desc: 'Debit order — Vodacom', amount: 'R 899', match: 'Telephone', confidence: '98%' },
  { desc: 'EFT — unknown payer', amount: 'R 4 500', match: null, confidence: null },
];

export function ReconcileVisual() {
  return (
    <Frame label="Banking / reconcile">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">FNB Business Cheque · 214 lines imported</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-brand-muted px-2 py-1 text-[10px] font-medium text-brand">
          <SparklesIcon className="size-3" />
          211 auto-matched
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {statementLines.map((line) => (
          <div key={line.desc} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/60 p-2.5">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[11px] font-medium">{line.desc}</span>
              {line.match ? (
                <span className="flex items-center gap-1 text-[10px] text-brand">
                  <CheckIcon className="size-3" />
                  {line.match} · {line.confidence} match
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <TriangleAlertIcon className="size-3" />
                  Needs your attention
                </span>
              )}
            </div>
            <span className="shrink-0 text-[11px] tabular-nums">{line.amount}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-lg bg-brand-muted px-3 py-2.5">
        <span className="text-[11px] font-medium text-brand">Unreconciled difference</span>
        <span className="text-[11px] font-medium text-brand tabular-nums">R 0.00</span>
      </div>
    </Frame>
  );
}

const vatFields = [
  { code: 'Field 1', label: 'Standard rate supplies', value: 'R 3 218 400' },
  { code: 'Field 4', label: 'Output tax', value: 'R 419 791' },
  { code: 'Field 14', label: 'Capital goods input', value: 'R 88 640' },
  { code: 'Field 15', label: 'Other input tax', value: 'R 323 311' },
];

export function VatVisual() {
  return (
    <Frame label="Tax / VAT201">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">Period 07 · Jul – Aug · due 25 Sep</span>
        <span className="rounded-full border border-brand/25 bg-brand-muted px-2 py-1 text-[10px] font-medium text-brand">Ready to submit</span>
      </div>

      <div className="flex flex-col gap-px overflow-hidden rounded-lg border border-border/70 bg-border/70">
        {vatFields.map((field) => (
          <div key={field.code} className="flex items-center justify-between gap-3 bg-background/70 px-3 py-2.5">
            <div className="flex min-w-0 flex-col">
              <span className="font-mono text-[9px] text-muted-foreground">{field.code}</span>
              <span className="truncate text-[11px]">{field.label}</span>
            </div>
            <span className="shrink-0 text-[11px] tabular-nums">{field.value}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-lg border border-brand/25 bg-brand-muted px-3 py-3">
        <span className="text-xs font-medium text-brand">Payable to SARS</span>
        <span className="text-sm font-semibold text-brand tabular-nums">R 96 480</span>
      </div>
    </Frame>
  );
}
