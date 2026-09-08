import { downloadCSV } from '@/features/export/csvExport';
import type { ExportDataset } from '@/features/export/types';
import type { ImportRowOutcome } from '../types';
import type { ImportBatchIssue } from './types';

/** Requirement 10 — downloadable exception report, CSV, reusing the existing safe export pipeline (formula-injection escaping etc. already handled by `downloadCSV`/`csvExport.ts`). */
export function downloadExceptionReport(
  filenamePrefix: string,
  issues: (ImportBatchIssue & { batchFileName?: string })[],
): void {
  const dataset: ExportDataset<(typeof issues)[number]> = {
    title: 'Import Exceptions',
    columns: [
      { key: 'batch', header: 'Batch', accessor: (r) => r.batchFileName ?? r.batchId },
      { key: 'row', header: 'Row', accessor: (r) => r.rowNumber ?? null },
      { key: 'field', header: 'Field', accessor: (r) => r.fieldName ?? '' },
      { key: 'severity', header: 'Severity', accessor: (r) => r.severity },
      { key: 'category', header: 'Category', accessor: (r) => r.category },
      { key: 'sourceValue', header: 'Source Value', accessor: (r) => r.sourceValue ?? '' },
      { key: 'message', header: 'Message', accessor: (r) => r.message },
      { key: 'resolutionStatus', header: 'Resolution Status', accessor: (r) => r.resolutionStatus },
    ],
    rows: issues,
    filename: `${filenamePrefix}-exceptions-${new Date().toISOString().slice(0, 10)}`,
  };
  downloadCSV(dataset);
}

/**
 * Requirement 11 — downloadable full import-result report (every row's
 * outcome, not just errors — the existing `errorReport.ts` only ever
 * covered error rows). Built from `ImportExecutionSummary.rows`, which is
 * in-memory only for the duration of one wizard run (Part "do not persist
 * every source row" — see importBatchService.ts) — this can only be
 * offered from the wizard's own Result step, not re-derived later from
 * Batch Detail. "Created / Mapped Record" shows `ImportRowOutcome.recordRef`
 * where the adapter set one — always a safe business identifier (an account
 * code, customer/supplier code, journal number), NEVER a raw internal
 * id/UUID; blank for a row/adapter that doesn't have one, never fabricated.
 */
export function downloadResultReport(fileName: string, recordType: string, rows: ImportRowOutcome[]): void {
  const dataset: ExportDataset<ImportRowOutcome> = {
    title: 'Import Result',
    columns: [
      { key: 'row', header: 'Source Row', accessor: (r) => r.rowNumber },
      { key: 'recordType', header: 'Record Type', accessor: () => recordType },
      { key: 'result', header: 'Result', accessor: (r) => r.outcome },
      { key: 'recordRef', header: 'Created / Mapped Record', accessor: (r) => r.recordRef ?? '' },
      { key: 'message', header: 'Warning / Error', accessor: (r) => r.message ?? '' },
    ],
    rows,
    filename: `${fileName.replace(/\.[^.]+$/, '')}-import-result-${new Date().toISOString().slice(0, 10)}`,
  };
  downloadCSV(dataset);
}
