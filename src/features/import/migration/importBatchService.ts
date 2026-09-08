import { supabase } from '@/config/supabase';
import type { ImportExecutionSummary } from '../types';
import { sha256Hex, safeFileName } from './fileHash';
import type { ImportBatch, ImportBatchIssue, ImportBatchStatus, ImportIssueSeverity, SourceSystem } from './types';

interface ImportBatchRow {
  id: string;
  company_id: string;
  import_type: string;
  source_system: string;
  file_name: string;
  storage_path: string | null;
  mime_type: string | null;
  file_size: number | string | null;
  file_hash: string | null;
  status: string;
  row_count: number;
  valid_count: number;
  warning_count: number;
  error_count: number;
  imported_count: number;
  updated_count: number;
  skipped_count: number;
  mapping_profile_id: string | null;
  column_mapping: Record<string, unknown>;
  duplicate_strategy: string | null;
  result_summary: Record<string, unknown>;
  metadata: Record<string, unknown>;
  uploaded_by: string | null;
  uploaded_at: string;
  validated_at: string | null;
  confirmed_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapBatch(row: ImportBatchRow): ImportBatch {
  return {
    id: row.id,
    companyId: row.company_id,
    importType: row.import_type,
    sourceSystem: row.source_system as SourceSystem,
    fileName: row.file_name,
    storagePath: row.storage_path ?? undefined,
    mimeType: row.mime_type ?? undefined,
    fileSize: row.file_size === null ? undefined : Number(row.file_size),
    fileHash: row.file_hash ?? undefined,
    status: row.status as ImportBatchStatus,
    rowCount: row.row_count,
    validCount: row.valid_count,
    warningCount: row.warning_count,
    errorCount: row.error_count,
    importedCount: row.imported_count,
    updatedCount: row.updated_count,
    skippedCount: row.skipped_count,
    mappingProfileId: row.mapping_profile_id ?? undefined,
    columnMapping: row.column_mapping ?? {},
    duplicateStrategy: row.duplicate_strategy ?? undefined,
    resultSummary: row.result_summary ?? {},
    metadata: row.metadata ?? {},
    uploadedBy: row.uploaded_by ?? undefined,
    uploadedAt: row.uploaded_at,
    validatedAt: row.validated_at ?? undefined,
    confirmedAt: row.confirmed_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    failedAt: row.failed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const BATCH_COLUMNS =
  'id, company_id, import_type, source_system, file_name, storage_path, mime_type, file_size, file_hash, status, row_count, valid_count, warning_count, error_count, imported_count, updated_count, skipped_count, mapping_profile_id, column_mapping, duplicate_strategy, result_summary, metadata, uploaded_by, uploaded_at, validated_at, confirmed_at, completed_at, failed_at, created_at, updated_at';

export interface CreateBatchInput {
  importType: string;
  sourceSystem: SourceSystem;
  file: File;
}

/**
 * Creates the batch's storage-backed record: uploads the original file to
 * the private `import-sources` bucket (Part 2/35: "wizard must preserve the
 * original uploaded file"), hashes it for duplicate-file detection (Part
 * 27), then inserts the `import_batches` row via the path-validating RPC
 * (`create_import_batch`, migration 0069 — same pattern as
 * `create_manual_journal_attachment`).
 */
export async function createBatch(input: CreateBatchInput): Promise<ImportBatch> {
  const { data: companyId, error: companyError } = await supabase.rpc('get_my_company_id');
  if (companyError || !companyId) throw new Error(companyError?.message ?? 'Could not resolve the active company.');

  const hash = await sha256Hex(input.file);
  const storagePath = `${companyId}/${crypto.randomUUID()}-${safeFileName(input.file.name)}`;
  const { error: storageError } = await supabase.storage.from('import-sources').upload(storagePath, input.file, { contentType: input.file.type || undefined, upsert: false });
  if (storageError) throw new Error(storageError.message);

  const { data, error } = await supabase.rpc('create_import_batch', {
    p_import_type: input.importType,
    p_source_system: input.sourceSystem,
    p_file_name: input.file.name,
    p_storage_path: storagePath,
    p_mime_type: input.file.type || null,
    p_file_size: input.file.size,
    p_file_hash: hash,
  });
  if (error || !data) {
    await supabase.storage.from('import-sources').remove([storagePath]);
    throw new Error(error?.message ?? 'Failed to create the import batch.');
  }
  return mapBatch(data as ImportBatchRow);
}

/** Prior batches (any status) for this company sharing the same file content — Part 27's "already imported" signal, shown as a warning, never a hard block (Part 27: "do not hard-block retrying a failed/cancelled import"). */
export async function findBatchesByHash(fileHash: string): Promise<ImportBatch[]> {
  const { data, error } = await supabase.from('import_batches').select(BATCH_COLUMNS).eq('file_hash', fileHash).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapBatch(row as ImportBatchRow));
}

export async function getBatch(id: string): Promise<ImportBatch | undefined> {
  const { data, error } = await supabase.from('import_batches').select(BATCH_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapBatch(data as ImportBatchRow) : undefined;
}

export async function listBatches(): Promise<ImportBatch[]> {
  const { data, error } = await supabase.from('import_batches').select(BATCH_COLUMNS).order('created_at', { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapBatch(row as ImportBatchRow));
}

export interface RecordValidationInput {
  rowCount: number;
  validCount: number;
  warningCount: number;
  errorCount: number;
  columnMapping: Record<string, unknown>;
  duplicateStrategy?: string;
  /** Persisted to `import_batch_issues` — one row per warning/error message, never the raw source row (Part 30/34). */
  issues: { severity: ImportIssueSeverity; issueCode: string; category: string; rowNumber?: number; fieldName?: string; sourceValue?: string; message: string; resolutionHint?: string }[];
}

/** Updates a batch after column mapping + row validation ran — status becomes `validation_failed` (blocking errors present) or `ready`, and every issue is persisted so the Exceptions page can filter/resolve without re-parsing the file. */
export async function recordValidation(batchId: string, input: RecordValidationInput): Promise<void> {
  const status: ImportBatchStatus = input.errorCount > 0 ? 'validation_failed' : 'ready';
  const { error } = await supabase
    .from('import_batches')
    .update({
      status,
      row_count: input.rowCount,
      valid_count: input.validCount,
      warning_count: input.warningCount,
      error_count: input.errorCount,
      column_mapping: input.columnMapping,
      duplicate_strategy: input.duplicateStrategy ?? null,
      validated_at: new Date().toISOString(),
    })
    .eq('id', batchId);
  if (error) throw new Error(error.message);

  // Clear any issues from a prior validation pass on this same batch (e.g. the user went back and remapped) before writing the current set.
  const { error: clearError } = await supabase.from('import_batch_issues').delete().eq('batch_id', batchId);
  if (clearError) throw new Error(clearError.message);

  if (input.issues.length === 0) return;
  const { data: companyId } = await supabase.rpc('get_my_company_id');
  const rows = input.issues.map((issue) => ({
    company_id: companyId,
    batch_id: batchId,
    severity: issue.severity,
    issue_code: issue.issueCode,
    category: issue.category,
    row_number: issue.rowNumber ?? null,
    field_name: issue.fieldName ?? null,
    source_value: issue.sourceValue ? issue.sourceValue.slice(0, 500) : null,
    message: issue.message.slice(0, 1000),
    resolution_hint: issue.resolutionHint ?? null,
  }));
  const { error: insertError } = await supabase.from('import_batch_issues').insert(rows);
  if (insertError) throw new Error(insertError.message);
}

export async function markImporting(batchId: string): Promise<void> {
  const { error } = await supabase.from('import_batches').update({ status: 'importing', confirmed_at: new Date().toISOString() }).eq('id', batchId);
  if (error) throw new Error(error.message);
}

/** Records the final ImportExecutionSummary — counts only, matching the existing `recordImportAudit()` precedent (never the raw parsed rows). */
export async function completeBatch(batchId: string, summary: ImportExecutionSummary, metadata?: Record<string, unknown>): Promise<void> {
  const status: ImportBatchStatus = summary.errored > 0 ? 'completed_with_warnings' : 'completed';
  const { error } = await supabase
    .from('import_batches')
    .update({
      status,
      imported_count: summary.imported,
      updated_count: summary.updated,
      skipped_count: summary.skipped,
      error_count: summary.errored,
      result_summary: { ...summary, rows: undefined },
      metadata: metadata ?? {},
      completed_at: new Date().toISOString(),
    })
    .eq('id', batchId);
  if (error) throw new Error(error.message);
}

export async function failBatch(batchId: string, message: string): Promise<void> {
  const { error } = await supabase
    .from('import_batches')
    .update({ status: 'failed', result_summary: { error: message }, failed_at: new Date().toISOString() })
    .eq('id', batchId);
  if (error) throw new Error(error.message);
}

/** Safe cancellation of an uncommitted batch (Part 33) — a status change, never a delete; the source file and audit trail are retained. */
export async function cancelBatch(batchId: string): Promise<void> {
  const { error } = await supabase.from('import_batches').update({ status: 'cancelled' }).eq('id', batchId);
  if (error) throw new Error(error.message);
}

export async function getBatchIssues(batchId: string): Promise<ImportBatchIssue[]> {
  const { data, error } = await supabase
    .from('import_batch_issues')
    .select('id, company_id, batch_id, severity, issue_code, category, row_number, field_name, source_value, message, resolution_hint, resolution_status, resolution_metadata, created_at, resolved_at, resolved_by')
    .eq('batch_id', batchId)
    .order('row_number', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    companyId: row.company_id as string,
    batchId: row.batch_id as string,
    severity: row.severity as ImportBatchIssue['severity'],
    issueCode: row.issue_code as string,
    category: row.category as string,
    rowNumber: (row.row_number as number | null) ?? undefined,
    fieldName: (row.field_name as string | null) ?? undefined,
    sourceValue: (row.source_value as string | null) ?? undefined,
    message: row.message as string,
    resolutionHint: (row.resolution_hint as string | null) ?? undefined,
    resolutionStatus: row.resolution_status as ImportBatchIssue['resolutionStatus'],
    resolutionMetadata: (row.resolution_metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
    resolvedAt: (row.resolved_at as string | null) ?? undefined,
    resolvedBy: (row.resolved_by as string | null) ?? undefined,
  }));
}

/** Every open issue across every batch for this company — the Exceptions page's data source. */
export async function listOpenIssues(): Promise<(ImportBatchIssue & { batchFileName: string; batchImportType: string })[]> {
  const { data, error } = await supabase
    .from('import_batch_issues')
    .select('id, company_id, batch_id, severity, issue_code, category, row_number, field_name, source_value, message, resolution_hint, resolution_status, resolution_metadata, created_at, resolved_at, resolved_by, import_batches!inner(file_name, import_type)')
    .eq('resolution_status', 'open')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const batch = row.import_batches as unknown as { file_name: string; import_type: string };
    return {
      id: row.id as string,
      companyId: row.company_id as string,
      batchId: row.batch_id as string,
      severity: row.severity as ImportBatchIssue['severity'],
      issueCode: row.issue_code as string,
      category: row.category as string,
      rowNumber: (row.row_number as number | null) ?? undefined,
      fieldName: (row.field_name as string | null) ?? undefined,
      sourceValue: (row.source_value as string | null) ?? undefined,
      message: row.message as string,
      resolutionHint: (row.resolution_hint as string | null) ?? undefined,
      resolutionStatus: row.resolution_status as ImportBatchIssue['resolutionStatus'],
      resolutionMetadata: (row.resolution_metadata as Record<string, unknown>) ?? {},
      createdAt: row.created_at as string,
      resolvedAt: (row.resolved_at as string | null) ?? undefined,
      resolvedBy: (row.resolved_by as string | null) ?? undefined,
      batchFileName: batch?.file_name ?? '',
      batchImportType: batch?.import_type ?? '',
    };
  });
}

export async function resolveIssue(issueId: string, resolutionStatus: 'resolved' | 'ignored', metadata?: Record<string, unknown>): Promise<void> {
  const { data: userId } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('import_batch_issues')
    .update({ resolution_status: resolutionStatus, resolution_metadata: metadata ?? {}, resolved_at: new Date().toISOString(), resolved_by: userId?.user?.id ?? null })
    .eq('id', issueId);
  if (error) throw new Error(error.message);
}

/** A signed URL to re-download the original uploaded source file (Part 32: "downloadable original source"), never the raw internal storage path (Part 32: "do not expose internal storage paths"). */
export async function getSourceFileUrl(batch: ImportBatch): Promise<string> {
  if (!batch.storagePath) throw new Error('This batch has no stored source file.');
  const { data, error } = await supabase.storage.from('import-sources').createSignedUrl(batch.storagePath, 60);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'Could not create a secure link for this file.');
  return data.signedUrl;
}
