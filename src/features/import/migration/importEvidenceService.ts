import { supabase } from '@/config/supabase';
import { safeFileName } from './fileHash';
import type { ImportEvidenceDocument } from './types';

const ACCEPTED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const MAX_FILE_SIZE = 10 * 1024 * 1024;

interface EvidenceRow {
  id: string;
  company_id: string;
  batch_id: string | null;
  document_name: string;
  document_type: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  file_size: number | string | null;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
}

const EVIDENCE_COLUMNS = 'id, company_id, batch_id, document_name, document_type, storage_path, file_name, mime_type, file_size, notes, uploaded_by, created_at';

function mapEvidence(row: EvidenceRow): ImportEvidenceDocument {
  return {
    id: row.id,
    companyId: row.company_id,
    batchId: row.batch_id ?? undefined,
    documentName: row.document_name,
    documentType: row.document_type,
    storagePath: row.storage_path,
    fileName: row.file_name,
    mimeType: row.mime_type ?? undefined,
    fileSize: row.file_size === null ? undefined : Number(row.file_size),
    notes: row.notes ?? undefined,
    uploadedBy: row.uploaded_by ?? undefined,
    createdAt: row.created_at,
  };
}

/**
 * Uploads one supporting document to the private `import-evidence` bucket
 * and records its metadata — evidence only (Part 4/35): this NEVER creates
 * an accounting entry, and the caller doesn't get to make it do so.
 */
export async function uploadEvidence(input: { file: File; documentName: string; documentType: string; batchId?: string; notes?: string }): Promise<ImportEvidenceDocument> {
  if (!ACCEPTED_TYPES.has(input.file.type)) throw new Error('Only PDF, JPG, and PNG files are accepted as evidence.');
  if (input.file.size > MAX_FILE_SIZE) throw new Error('Evidence files must be 10 MB or smaller.');

  const { data: companyId, error: companyError } = await supabase.rpc('get_my_company_id');
  if (companyError || !companyId) throw new Error(companyError?.message ?? 'Could not resolve the active company.');

  const storagePath = `${companyId}/${crypto.randomUUID()}-${safeFileName(input.file.name)}`;
  const { error: storageError } = await supabase.storage.from('import-evidence').upload(storagePath, input.file, { contentType: input.file.type, upsert: false });
  if (storageError) throw new Error(storageError.message);

  const { data, error } = await supabase.rpc('create_import_evidence_document', {
    p_document_name: input.documentName,
    p_document_type: input.documentType,
    p_storage_path: storagePath,
    p_file_name: input.file.name,
    p_mime_type: input.file.type,
    p_file_size: input.file.size,
    p_batch_id: input.batchId ?? null,
    p_notes: input.notes ?? null,
  });
  if (error || !data) {
    await supabase.storage.from('import-evidence').remove([storagePath]);
    throw new Error(error?.message ?? 'Failed to record the evidence document.');
  }
  return mapEvidence(data as EvidenceRow);
}

export async function listEvidence(batchId?: string): Promise<ImportEvidenceDocument[]> {
  let query = supabase.from('import_evidence_documents').select(EVIDENCE_COLUMNS).order('created_at', { ascending: false });
  if (batchId) query = query.eq('batch_id', batchId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapEvidence(row as EvidenceRow));
}

export async function removeEvidence(id: string, storagePath: string): Promise<void> {
  const { error: rpcError } = await supabase.rpc('remove_import_evidence_document', { p_document_id: id });
  if (rpcError) throw new Error(rpcError.message);
  await supabase.storage.from('import-evidence').remove([storagePath]);
}

export async function getEvidenceUrl(document: ImportEvidenceDocument): Promise<string> {
  const { data, error } = await supabase.storage.from('import-evidence').createSignedUrl(document.storagePath, 60);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'Could not create a secure link for this document.');
  return data.signedUrl;
}
