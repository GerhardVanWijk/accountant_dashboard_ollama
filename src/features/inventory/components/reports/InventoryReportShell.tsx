import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import { ExportMenu } from '@/features/export/components/ExportMenu';
import { PrintableReport } from '@/features/export/components/PrintableReport';
import type { ExportDataset } from '@/features/export/types';

interface InventoryReportShellProps<T> {
  title: string;
  description: string;
  loading: boolean;
  error: Error | null;
  onRetry?: () => void;
  /** Extra header controls (e.g. a date-range control) rendered before the Export menu. */
  headerExtra?: ReactNode;
  /** A row of FigureBlocks or similar — rendered in its own SectionCard above the main content. */
  summary?: ReactNode;
  /** The report's main content — usually a `SectionCard` wrapping a `DataTable`, but a non-tabular report (Reconciliation) may render anything here. */
  children: ReactNode;
  /** Extra prose/notes rendered below the main content (limitations, formula explanations) — spec §28 wants this documented on-screen, not just in docs/. */
  footnote?: ReactNode;
  exportDataset: ExportDataset<T>;
  canExport: boolean;
}

/**
 * The one chrome every Inventory report page shares (Phase 8 spec §20) —
 * title/description, loading/error handling, an optional summary row, the
 * Export menu (Print/Save PDF, CSV, Excel — Phase 7 infrastructure, never a
 * bespoke per-report implementation), and the hidden `PrintableReport` that
 * `window.print()` reveals. A report's OWN logic (row building, filtering,
 * totals) lives in its page component and the pure builders under
 * `src/features/inventory/reports/` — this component only supplies the
 * repeated wrapper.
 */
export function InventoryReportShell<T>({
  title,
  description,
  loading,
  error,
  onRetry,
  headerExtra,
  summary,
  children,
  footnote,
  exportDataset,
  canExport,
}: InventoryReportShellProps<T>) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={title}
        description={description}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {headerExtra}
            <ExportMenu dataset={exportDataset} allowed={canExport} />
          </div>
        }
      />

      {summary}

      {loading ? (
        <div role="status" className="flex min-h-[30vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading report…</p>
        </div>
      ) : error ? (
        <div role="alert" className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error.message}</span>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          )}
        </div>
      ) : (
        children
      )}

      {footnote && <p className="text-xs text-muted-foreground print:hidden">{footnote}</p>}

      <PrintableReport dataset={exportDataset} className="hidden print:block" />
    </div>
  );
}

/** A plain `SectionCard`-wrapped grid of summary figures — the shape every report's summary slot uses. */
export function ReportSummaryCard({ children }: { children: ReactNode }) {
  return (
    <SectionCard>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </SectionCard>
  );
}
