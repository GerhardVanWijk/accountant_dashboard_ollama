import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, Download, Loader2, XCircle } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { StatusBadge } from '@/components/app/status-badge';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { getBatch, getBatchIssues, getSourceFileUrl } from '../migration/importBatchService';
import { reconcileImportBatch, isFullyReconciled, type ReconciliationLine } from '../migration/reconciliation';
import { downloadExceptionReport } from '../migration/reports';
import { listEvidence, getEvidenceUrl } from '../migration/importEvidenceService';
import type { ImportBatch, ImportBatchIssue, ImportEvidenceDocument } from '../migration/types';

function formatDate(iso?: string): string {
  return iso ? new Date(iso).toLocaleString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
}
function formatCurrency(n: number): string {
  return `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ImportBatchDetailPage() {
  const { batchId } = useParams<{ batchId: string }>();
  const [batch, setBatch] = useState<ImportBatch | undefined>(undefined);
  const [issues, setIssues] = useState<ImportBatchIssue[]>([]);
  const [evidence, setEvidence] = useState<ImportEvidenceDocument[]>([]);
  const [reconciliation, setReconciliation] = useState<ReconciliationLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!batchId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([getBatch(batchId), getBatchIssues(batchId), listEvidence(batchId)])
      .then(async ([b, i, docs]) => {
        if (cancelled) return;
        setBatch(b);
        setIssues(i);
        setEvidence(docs);
        if (b) setReconciliation(await reconcileImportBatch(b));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load this batch.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [batchId]);

  async function downloadSource() {
    if (!batch) return;
    try {
      const url = await getSourceFileUrl(batch);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open the source file.');
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Loading…
      </div>
    );
  }
  if (!batch) {
    return <p className="p-8 text-center text-sm text-muted-foreground">Import batch not found.</p>;
  }

  const summary = batch.resultSummary as Record<string, unknown>;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title={batch.fileName}
        description={`${batch.importType} · ${batch.sourceSystem} · uploaded ${formatDate(batch.uploadedAt)}`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void downloadSource()} disabled={!batch.storagePath}>
              Download original source
            </Button>
            <Button variant="outline" size="sm" render={<Link to="/admin/imports/history" />}>
              Back to history
            </Button>
          </>
        }
      />

      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <SectionCard title="Status">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-[0.6875rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Status</span>
            <StatusBadge status={batch.status} />
          </div>
          <FigureBlock label="Rows" value={String(batch.rowCount)} />
          <FigureBlock label="Imported / Updated" value={`${batch.importedCount} / ${batch.updatedCount}`} />
          <FigureBlock label="Errors" value={String(batch.errorCount)} tone={batch.errorCount > 0 ? 'negative' : 'default'} />
        </div>
      </SectionCard>

      {reconciliation.length > 0 && (
        <SectionCard title="Reconciliation" description="Compares this migration's own subledger detail against what actually posted to the control account.">
          <div className="flex flex-col gap-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              {isFullyReconciled(reconciliation) ? (
                <span className="flex items-center gap-1.5 text-status-positive"><CheckCircle2 className="size-4" aria-hidden="true" /> PASS</span>
              ) : (
                <span className="flex items-center gap-1.5 text-status-negative"><XCircle className="size-4" aria-hidden="true" /> ATTENTION REQUIRED</span>
              )}
            </p>
            {reconciliation.map((line) => (
              <div key={line.label} className="grid grid-cols-1 gap-x-6 gap-y-1 rounded-lg border border-border p-3 text-sm sm:grid-cols-4">
                <span className="font-medium">{line.label}</span>
                <span className="text-muted-foreground">Subledger: {formatCurrency(line.subledgerTotal)}</span>
                <span className="text-muted-foreground">Control: {formatCurrency(line.controlTotal)}</span>
                <span className={line.status === 'pass' ? 'text-status-positive' : line.status === 'fail' ? 'text-status-negative' : 'text-muted-foreground'}>
                  Difference: {formatCurrency(line.difference)} {line.detail && `— ${line.detail}`}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {(typeof summary?.draftRecordId === 'string' || (Array.isArray((batch.metadata as Record<string, unknown>)?.draftJournalIds) && ((batch.metadata as Record<string, unknown>).draftJournalIds as unknown[]).length > 0)) && (
        <SectionCard title="Draft journal(s)">
          <p className="text-sm text-muted-foreground">
            This import created {Array.isArray((batch.metadata as Record<string, unknown>)?.draftJournalIds) ? ((batch.metadata as Record<string, unknown>).draftJournalIds as unknown[]).length : 1} draft journal
            {(Array.isArray((batch.metadata as Record<string, unknown>)?.draftJournalIds) ? ((batch.metadata as Record<string, unknown>).draftJournalIds as unknown[]).length : 1) === 1 ? '' : 's'} — nothing has posted yet. Review and post from{' '}
            <Link to="/accounting/journals" className="text-brand hover:underline">
              Journals
            </Link>
            .
          </p>
        </SectionCard>
      )}

      {typeof (batch.metadata as Record<string, unknown>)?.note === 'string' && (
        <p role="alert" className="rounded-lg border border-status-warning-outline bg-status-warning-surface px-3 py-2.5 text-sm text-status-warning">
          {(batch.metadata as Record<string, unknown>).note as string}
        </p>
      )}

      <SectionCard title="Documents & Evidence" description="Supporting files associated with this import batch.">
        {evidence.length === 0 ? (
          <p className="text-sm text-muted-foreground">No evidence attached to this batch.</p>
        ) : (
          <div className="divide-y divide-border/50">
            {evidence.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <button
                  type="button"
                  className="min-w-0 text-left font-medium break-words text-brand hover:underline"
                  onClick={() =>
                    void getEvidenceUrl(doc)
                      .then((url) => window.open(url, '_blank', 'noopener,noreferrer'))
                      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to open this document.'))
                  }
                >
                  {doc.documentName}
                </button>
                <span className="shrink-0 text-xs text-muted-foreground">{doc.documentType}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Exceptions"
        description={`${issues.length} issue(s) recorded for this batch.`}
        actions={
          issues.length > 0 ? (
            <Button variant="outline" size="sm" onClick={() => downloadExceptionReport(batch.fileName, issues.map((i) => ({ ...i, batchFileName: batch.fileName })))}>
              <Download className="mr-1.5 size-3.5" aria-hidden="true" /> Download report
            </Button>
          ) : undefined
        }
      >
        {issues.length === 0 ? (
          <p className="text-sm text-muted-foreground">No issues.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto rounded-lg border border-border">
            {issues.map((issue) => (
              <div key={issue.id} className="flex flex-col gap-0.5 border-b border-border/50 px-3 py-2 text-sm last:border-0">
                <span className="flex items-center gap-2">
                  <span className={issue.severity === 'error' ? 'text-status-negative' : issue.severity === 'warning' ? 'text-status-warning' : 'text-muted-foreground'}>
                    {issue.severity.toUpperCase()}
                  </span>
                  {issue.rowNumber && <span className="text-muted-foreground">Row {issue.rowNumber}</span>}
                  {issue.fieldName && <span className="text-muted-foreground">· {issue.fieldName}</span>}
                </span>
                <span className="break-words">{issue.message}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
