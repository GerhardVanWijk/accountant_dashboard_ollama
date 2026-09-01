import { auditLogService } from '@/services/auditLogService';
import type { ImportExecutionSummary } from '../types';

/**
 * Records one summary audit row per completed import run (spec §17) — row
 * count, success/failure split, actor, file name, timestamp. Never the
 * uploaded file itself (spec §17: "avoid storing full uploaded
 * spreadsheets in the audit log"); `previousValue`/`newValue` carry only
 * the counts, not the parsed rows. Per-record actions (a `Product`'s own
 * 'created', a stock adjustment's 'stock_import_committed', …) are logged
 * separately by whatever service call the adapter's `execute()` makes —
 * this is purely the batch-level record.
 */
export async function recordImportAudit(input: {
  adapterId: string;
  adapterLabel: string;
  fileName: string;
  actorUserId: string;
  summary: ImportExecutionSummary;
}): Promise<void> {
  const recordId = `import_${Date.now()}`;
  await auditLogService.log({
    userId: input.actorUserId,
    action: 'data_imported',
    module: 'import',
    recordType: 'ImportBatch',
    recordId,
    newValue: {
      adapterId: input.adapterId,
      adapterLabel: input.adapterLabel,
      fileName: input.fileName,
      rowsRead: input.summary.rowsRead,
      imported: input.summary.imported,
      updated: input.summary.updated,
      skipped: input.summary.skipped,
      errored: input.summary.errored,
    },
    reason: `Imported "${input.fileName}" via ${input.adapterLabel}.`,
  });
}
