/**
 * Phase D — Data Import & Migration Centre domain types. Separate from
 * `src/features/import/types.ts` (the generic ImportAdapter pipeline
 * contract, unchanged) — these are the persistence-layer shapes for
 * `import_batches` / `import_batch_issues` / `import_mapping_profiles` /
 * `import_evidence_documents` (migration 0069/0070), mapped from snake_case
 * DB rows to camelCase app objects the same way every other Supabase
 * repository in this codebase already does.
 */

export type ImportBatchStatus =
  | 'uploaded'
  | 'mapping'
  | 'validation_failed'
  | 'ready'
  | 'importing'
  | 'completed'
  | 'completed_with_warnings'
  | 'failed'
  | 'cancelled';

export type SourceSystem = 'generic' | 'pastel_sage' | 'xero' | 'syspro' | 'vertex_package';

export interface ImportBatch {
  id: string;
  companyId: string;
  importType: string;
  sourceSystem: SourceSystem;
  fileName: string;
  storagePath?: string;
  mimeType?: string;
  fileSize?: number;
  fileHash?: string;
  status: ImportBatchStatus;
  rowCount: number;
  validCount: number;
  warningCount: number;
  errorCount: number;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  mappingProfileId?: string;
  columnMapping: Record<string, unknown>;
  duplicateStrategy?: string;
  resultSummary: Record<string, unknown>;
  metadata: Record<string, unknown>;
  uploadedBy?: string;
  uploadedAt: string;
  validatedAt?: string;
  confirmedAt?: string;
  completedAt?: string;
  failedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type ImportIssueSeverity = 'error' | 'warning' | 'info';
export type ImportIssueResolutionStatus = 'open' | 'resolved' | 'ignored';

export interface ImportBatchIssue {
  id: string;
  companyId: string;
  batchId: string;
  severity: ImportIssueSeverity;
  issueCode: string;
  category: string;
  rowNumber?: number;
  fieldName?: string;
  sourceValue?: string;
  message: string;
  resolutionHint?: string;
  resolutionStatus: ImportIssueResolutionStatus;
  resolutionMetadata: Record<string, unknown>;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface ImportMappingProfile {
  id: string;
  companyId?: string;
  name: string;
  sourceSystem: SourceSystem;
  importType: string;
  columnMappings: Record<string, unknown>;
  formatSettings: Record<string, unknown>;
  accountMappings: Record<string, unknown>;
  taxMappings: Record<string, unknown>;
  isSystem: boolean;
  isActive: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportEvidenceDocument {
  id: string;
  companyId: string;
  batchId?: string;
  documentName: string;
  documentType: string;
  storagePath: string;
  fileName: string;
  mimeType?: string;
  fileSize?: number;
  notes?: string;
  uploadedBy?: string;
  createdAt: string;
}
