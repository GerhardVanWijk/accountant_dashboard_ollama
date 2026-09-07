import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompanyDocument, ID } from '@/types';
import type {
  CreateCompanyDocumentInput,
  ICompanyDocumentRepository,
  UpdateCompanyDocumentInput,
} from './ICompanyDocumentRepository';

interface CompanyDocumentRow {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  category: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  document_date: string | null;
  expiry_date: string | null;
  tags: string[] | null;
  uploaded_by: string;
  uploaded_at: string;
  updated_at: string;
  is_archived: boolean;
  archived_at: string | null;
  archived_by: string | null;
  metadata: Record<string, unknown> | null;
}

function rowToDocument(row: CompanyDocumentRow): CompanyDocument {
  return {
    id: row.id,
    companyId: row.company_id,
    title: row.title,
    description: row.description ?? undefined,
    category: row.category,
    fileName: row.file_name,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    documentDate: row.document_date ?? undefined,
    expiryDate: row.expiry_date ?? undefined,
    tags: row.tags ?? [],
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
    updatedAt: row.updated_at,
    isArchived: row.is_archived,
    archivedAt: row.archived_at ?? undefined,
    archivedBy: row.archived_by ?? undefined,
    metadata: row.metadata ?? {},
  };
}

function patchToRow(patch: UpdateCompanyDocumentInput): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if ('title' in patch) row.title = patch.title;
  if ('description' in patch) row.description = patch.description ?? null;
  if ('category' in patch) row.category = patch.category;
  if ('documentDate' in patch) row.document_date = patch.documentDate ?? null;
  if ('expiryDate' in patch) row.expiry_date = patch.expiryDate ?? null;
  if ('tags' in patch) row.tags = patch.tags ?? [];
  if ('isArchived' in patch) row.is_archived = patch.isArchived;
  if ('metadata' in patch) row.metadata = patch.metadata ?? {};
  return row;
}

/** Supabase-backed ICompanyDocumentRepository (migration 0071). */
export class SupabaseCompanyDocumentRepository implements ICompanyDocumentRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listByCompany(companyId: ID): Promise<CompanyDocument[]> {
    const { data, error } = await this.client
      .from('company_documents')
      .select('*')
      .eq('company_id', companyId)
      .order('uploaded_at', { ascending: false });
    if (error) throw new Error(`SupabaseCompanyDocumentRepository.listByCompany: ${error.message}`);
    return (data as CompanyDocumentRow[]).map(rowToDocument);
  }

  async getById(id: ID): Promise<CompanyDocument | undefined> {
    const { data, error } = await this.client
      .from('company_documents')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`SupabaseCompanyDocumentRepository.getById: ${error.message}`);
    return data ? rowToDocument(data as CompanyDocumentRow) : undefined;
  }

  async create(input: CreateCompanyDocumentInput): Promise<CompanyDocument> {
    const { data, error } = await this.client
      .from('company_documents')
      .insert({
        company_id: input.companyId,
        title: input.title,
        description: input.description ?? null,
        category: input.category,
        file_name: input.fileName,
        storage_path: input.storagePath,
        mime_type: input.mimeType,
        file_size: input.fileSize,
        document_date: input.documentDate ?? null,
        expiry_date: input.expiryDate ?? null,
        tags: input.tags ?? [],
        uploaded_by: input.uploadedBy,
        metadata: input.metadata ?? {},
      })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseCompanyDocumentRepository.create: ${error.message}`);
    return rowToDocument(data as CompanyDocumentRow);
  }

  async update(id: ID, patch: UpdateCompanyDocumentInput): Promise<CompanyDocument> {
    const { data, error } = await this.client
      .from('company_documents')
      .update(patchToRow(patch))
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`SupabaseCompanyDocumentRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseCompanyDocumentRepository: document "${id}" not found`);
    return rowToDocument(data as CompanyDocumentRow);
  }

  async remove(id: ID): Promise<void> {
    const { error } = await this.client.from('company_documents').delete().eq('id', id);
    if (error) throw new Error(`SupabaseCompanyDocumentRepository.remove: ${error.message}`);
  }
}
