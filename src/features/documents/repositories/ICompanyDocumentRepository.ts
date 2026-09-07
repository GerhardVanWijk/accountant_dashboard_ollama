import type { CompanyDocument, ID } from '@/types';

/** Metadata row that has just been inserted — id/timestamps are DB-assigned. */
export type CreateCompanyDocumentInput = Omit<
  CompanyDocument,
  'id' | 'uploadedAt' | 'updatedAt' | 'isArchived' | 'archivedAt' | 'archivedBy'
>;

/** Only metadata + the archive flag are mutable; file identity is fixed (migration 0071 guard). */
export type UpdateCompanyDocumentInput = Partial<
  Pick<
    CompanyDocument,
    'title' | 'description' | 'category' | 'documentDate' | 'expiryDate' | 'tags' | 'isArchived' | 'metadata'
  >
>;

/**
 * Persistence contract for `company_documents` (migration 0071). RLS keeps
 * every query tenant-scoped — the repository never adds its own company
 * filter beyond what a caller passes for clarity.
 */
export interface ICompanyDocumentRepository {
  listByCompany(companyId: ID): Promise<CompanyDocument[]>;
  getById(id: ID): Promise<CompanyDocument | undefined>;
  create(input: CreateCompanyDocumentInput): Promise<CompanyDocument>;
  update(id: ID, patch: UpdateCompanyDocumentInput): Promise<CompanyDocument>;
  /** Hard delete of the metadata row. RLS allows this for superuser only. */
  remove(id: ID): Promise<void>;
}
