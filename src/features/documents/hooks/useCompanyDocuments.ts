import { useCallback, useEffect, useState } from 'react';
import type { CompanyDocument } from '@/types';
import { useAuthStore } from '@/stores/authStore';
import { companyDocumentService } from '../services';
import type { UpdateCompanyDocumentInput } from '../repositories/ICompanyDocumentRepository';
import type { UploadDocumentMeta, UploadFile } from '../services/companyDocumentService';

export interface UseCompanyDocumentsResult {
  documents: CompanyDocument[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  upload: (file: UploadFile, meta: UploadDocumentMeta) => Promise<void>;
  updateMetadata: (id: string, patch: UpdateCompanyDocumentInput) => Promise<void>;
  archive: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
  deleteForever: (doc: Pick<CompanyDocument, 'id' | 'storagePath'>) => Promise<void>;
  getDownloadUrl: (doc: Pick<CompanyDocument, 'storagePath'>) => Promise<string>;
}

/**
 * Company Documents list + mutations for the owning company. Always fetches
 * archived rows too — the page filters client-side so "Archived" is just a
 * toggle, not a refetch.
 */
export function useCompanyDocuments(): UseCompanyDocumentsResult {
  const companyId = useAuthStore((s) => s.profile?.companyId);
  const userId = useAuthStore((s) => s.profile?.id);
  const [documents, setDocuments] = useState<CompanyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    if (!companyId) {
      setDocuments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setDocuments(await companyDocumentService.list(companyId, { includeArchived: true }));
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load documents'));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const upload = useCallback(
    async (file: UploadFile, meta: UploadDocumentMeta) => {
      if (!companyId || !userId) throw new Error('You need an active company to upload documents.');
      await companyDocumentService.upload(companyId, userId, file, meta);
      await refetch();
    },
    [companyId, userId, refetch],
  );

  const updateMetadata = useCallback(
    async (id: string, patch: UpdateCompanyDocumentInput) => {
      await companyDocumentService.updateMetadata(id, patch);
      await refetch();
    },
    [refetch],
  );

  const archive = useCallback(
    async (id: string) => {
      await companyDocumentService.archive(id);
      await refetch();
    },
    [refetch],
  );

  const restore = useCallback(
    async (id: string) => {
      await companyDocumentService.restore(id);
      await refetch();
    },
    [refetch],
  );

  const deleteForever = useCallback(
    async (doc: Pick<CompanyDocument, 'id' | 'storagePath'>) => {
      await companyDocumentService.deleteForever(doc);
      await refetch();
    },
    [refetch],
  );

  const getDownloadUrl = useCallback(
    (doc: Pick<CompanyDocument, 'storagePath'>) => companyDocumentService.getDownloadUrl(doc),
    [],
  );

  return {
    documents,
    loading,
    error,
    refetch,
    upload,
    updateMetadata,
    archive,
    restore,
    deleteForever,
    getDownloadUrl,
  };
}
