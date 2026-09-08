import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileUp, Loader2 } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import { EnumSelect } from '@/components/app/combobox';
import { listEvidence, uploadEvidence, removeEvidence, getEvidenceUrl } from '../migration/importEvidenceService';
import type { ImportEvidenceDocument } from '../migration/types';

const DOCUMENT_TYPES = [
  { value: 'trial_balance', label: 'Trial Balance' },
  { value: 'general_ledger', label: 'General Ledger' },
  { value: 'bank_statement', label: 'Bank Statement' },
  { value: 'customer_schedule', label: 'Customer Schedule' },
  { value: 'supplier_schedule', label: 'Supplier Schedule' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'opening_balance', label: 'Opening Balance Evidence' },
  { value: 'working_paper', label: 'Working Paper' },
  { value: 'other', label: 'Other' },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatSize(bytes?: number): string {
  if (!bytes) return '—';
  return bytes > 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

export function ImportDocumentsPage() {
  const [documents, setDocuments] = useState<ImportEvidenceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [documentType, setDocumentType] = useState('other');
  const [error, setError] = useState<string | undefined>(undefined);

  async function load() {
    setLoading(true);
    setError(undefined);
    try {
      setDocuments(await listEvidence());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleUpload(file: File) {
    setUploading(true);
    setError(undefined);
    try {
      await uploadEvidence({ file, documentName: file.name, documentType });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload this document.');
    } finally {
      setUploading(false);
    }
  }

  async function handleOpen(doc: ImportEvidenceDocument) {
    try {
      window.open(await getEvidenceUrl(doc), '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open this document.');
    }
  }

  async function handleRemove(doc: ImportEvidenceDocument) {
    if (!window.confirm(`Remove "${doc.fileName}"?`)) return;
    try {
      await removeEvidence(doc.id, doc.storagePath);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove this document.');
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Documents & Evidence"
        description="Supporting source documents — PDFs, scans, working papers. Stored privately, per company. A document upload never creates an accounting entry on its own."
        actions={
          <Button variant="outline" size="sm" render={<Link to="/admin/imports" />}>
            Back to overview
          </Button>
        }
      />

      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <SectionCard title="Upload evidence">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Document type</label>
            <EnumSelect value={documentType} onValueChange={setDocumentType} options={DOCUMENT_TYPES} className="w-56" />
          </div>
          <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-4 text-sm font-medium text-brand hover:underline">
            <FileUp className="size-4" aria-hidden="true" />
            {uploading ? 'Uploading…' : 'Choose a PDF, JPG or PNG'}
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUpload(file);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </SectionCard>

      <SectionCard bodyClassName="p-0">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading…
          </div>
        ) : documents.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No evidence uploaded yet.</p>
        ) : (
          <div className="divide-y divide-border/50">
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between gap-3 p-4">
                {/* min-w-0 + break-words — an uploaded document's own filename can be arbitrarily long. */}
                <div className="flex min-w-0 flex-col gap-0.5">
                  <button type="button" onClick={() => void handleOpen(doc)} className="text-left text-sm font-medium break-words text-brand hover:underline">
                    {doc.documentName}
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {DOCUMENT_TYPES.find((t) => t.value === doc.documentType)?.label ?? doc.documentType} · {formatSize(doc.fileSize)} · {formatDate(doc.createdAt)}
                  </span>
                </div>
                <Button variant="ghost" size="sm" className="shrink-0" onClick={() => void handleRemove(doc)}>
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
