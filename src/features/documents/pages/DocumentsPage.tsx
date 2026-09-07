import { useEffect, useMemo, useState } from 'react';
import { Loader2, UploadCloud } from 'lucide-react';
import type { CompanyDocument, Profile } from '@/types';
import { documentExpiryStatus } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { HelpLink } from '@/features/help/components/HelpLink';
import { Button } from '@/components/ui/shadcn/button';
import { Checkbox } from '@/components/ui/shadcn/checkbox';
import { ConfirmDialog } from '@/components/app/form';
import { useAuthStore } from '@/stores/authStore';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { profileService } from '@/features/auth/services';
import { useCompanyDocuments } from '../hooks/useCompanyDocuments';
import { CompanyDocumentsTable } from '../components/CompanyDocumentsTable';
import { DocumentFormDialog } from '../components/DocumentFormDialog';

type Dialog =
  | { kind: 'upload' }
  | { kind: 'edit'; document: CompanyDocument }
  | null;

/**
 * Company Documents — route `/documents`. A secure, tenant-isolated store
 * for administrative company records (CIPC, SARS, VAT certificates,
 * contracts, insurance, licences, bank confirmations, board documents…).
 * Distinct from transactional accounting documents, which live in their
 * own modules. Bytes are in the private `company-documents` Storage bucket
 * (migration 0071); downloads are short-lived signed URLs.
 */
export function DocumentsPage() {
  const companyId = useAuthStore((s) => s.profile?.companyId);
  const isSuperuser = useAuthStore((s) => s.profile?.role === 'superuser');
  const canManage = useCanAccess('documents', 'create');

  const {
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
  } = useCompanyDocuments();

  const [profilesById, setProfilesById] = useState<Map<string, Profile>>(new Map());
  const [showArchived, setShowArchived] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [deleteTarget, setDeleteTarget] = useState<CompanyDocument | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    profileService
      .getByCompany(companyId)
      .then((profiles) => {
        if (!cancelled) setProfilesById(new Map(profiles.map((p) => [p.id, p])));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const visible = useMemo(
    () => (showArchived ? documents : documents.filter((d) => !d.isArchived)),
    [documents, showArchived],
  );

  const active = documents.filter((d) => !d.isArchived);
  const expiringSoon = active.filter((d) => documentExpiryStatus(d) === 'expiring_soon').length;
  const expired = active.filter((d) => documentExpiryStatus(d) === 'expired').length;
  const archivedCount = documents.length - active.length;

  async function handleDownload(doc: CompanyDocument) {
    setActionError(null);
    try {
      const url = await getDownloadUrl(doc);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not open that document.');
    }
  }

  async function handleArchiveToggle(doc: CompanyDocument) {
    setActionError(null);
    try {
      await (doc.isArchived ? restore(doc.id) : archive(doc.id));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update that document.');
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deleteForever({ id: deleteTarget.id, storagePath: deleteTarget.storagePath });
      setDeleteTarget(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not delete that document.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Company documents"
        description="Securely store and manage important company records and supporting documents."
        actions={
          <>
            <HelpLink article="documents" />
            {canManage && (
              <Button size="sm" onClick={() => setDialog({ kind: 'upload' })}>
                <UploadCloud data-icon="inline-start" />
                Upload document
              </Button>
            )}
          </>
        }
      />

      <SectionCard>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <FigureBlock label="Active documents" value={String(active.length)} hint="Not archived" />
          <FigureBlock label="Expiring soon" value={String(expiringSoon)} hint="Within 30 days" />
          <FigureBlock label="Expired" value={String(expired)} hint="Past their expiry date" />
          <FigureBlock label="Archived" value={String(archivedCount)} hint="Kept, not deleted" />
        </div>
      </SectionCard>

      {actionError && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      {loading ? (
        <div role="status" className="flex min-h-[30vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading documents…</p>
        </div>
      ) : error ? (
        <div role="alert" className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error.message}</span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <SectionCard
          title="All documents"
          bodyClassName="p-4 sm:p-5"
          actions={
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={showArchived}
                onCheckedChange={(v) => setShowArchived(v === true)}
                aria-label="Show archived documents"
              />
              Show archived
            </label>
          }
        >
          <CompanyDocumentsTable
            documents={visible}
            profilesById={profilesById}
            canManage={canManage}
            canDeleteForever={isSuperuser}
            onDownload={(d) => void handleDownload(d)}
            onEdit={(d) => setDialog({ kind: 'edit', document: d })}
            onArchiveToggle={(d) => void handleArchiveToggle(d)}
            onDeleteForever={(d) => setDeleteTarget(d)}
          />
        </SectionCard>
      )}

      {dialog?.kind === 'upload' && (
        <DocumentFormDialog
          mode="create"
          onUpload={(file, meta) => upload(file, meta)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'edit' && (
        <DocumentFormDialog
          mode="edit"
          document={dialog.document}
          onSaveMetadata={updateMetadata}
          onClose={() => setDialog(null)}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(null);
        }}
        title={`Permanently delete "${deleteTarget?.title}"?`}
        description="This removes the file and its record for good and cannot be undone. The deletion is written to the audit trail. Prefer Archive unless the document must be destroyed."
        destructive
        confirmLabel="Delete permanently"
        pending={deleting}
        error={actionError}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
