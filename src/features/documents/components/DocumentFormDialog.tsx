import { useEffect, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { UploadCloud } from 'lucide-react';
import type { CompanyDocument } from '@/types';
import { DOCUMENT_CATEGORY_SUGGESTIONS } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { FormShell, FormHeader, FormBody, FormSection, FormFooter } from '@/components/app/form';
import { formatFileSize } from '@/lib/app/format';
import {
  ACCEPT_ATTR,
  validateUploadFile,
  type UploadDocumentMeta,
} from '../services/companyDocumentService';
import type { UpdateCompanyDocumentInput } from '../repositories/ICompanyDocumentRepository';

const schema = z.object({
  title: z.string().trim().min(1, 'Give the document a title').max(200),
  category: z.string().trim().min(1, 'Choose a category').max(60),
  description: z.string().trim().max(2000).optional(),
  documentDate: z.string().optional(),
  expiryDate: z.string().optional(),
  tags: z.string().optional(),
});
type Values = z.infer<typeof schema>;

const CATEGORY_LIST_ID = 'company-document-categories';

export interface DocumentFormDialogProps {
  mode: 'create' | 'edit';
  document?: CompanyDocument;
  onUpload?: (file: File, meta: UploadDocumentMeta) => Promise<void>;
  onSaveMetadata?: (id: string, patch: UpdateCompanyDocumentInput) => Promise<void>;
  onClose: () => void;
}

function toDefaults(doc?: CompanyDocument): Values {
  return {
    title: doc?.title ?? '',
    category: doc?.category ?? '',
    description: doc?.description ?? '',
    documentDate: doc?.documentDate?.slice(0, 10) ?? '',
    expiryDate: doc?.expiryDate?.slice(0, 10) ?? '',
    tags: (doc?.tags ?? []).join(', '),
  };
}

export function DocumentFormDialog({
  mode,
  document,
  onUpload,
  onSaveMetadata,
  onClose,
}: DocumentFormDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toDefaults(document) });

  const dirty = isDirty || Boolean(file);
  useEffect(() => {
    if (mode === 'create') setServerError(null);
  }, [mode]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0] ?? null;
    setFileError(null);
    if (!chosen) {
      setFile(null);
      return;
    }
    const check = validateUploadFile(chosen);
    if (!check.ok) {
      setFile(null);
      setFileError(check.message);
      e.target.value = '';
      return;
    }
    setFile(chosen);
    // Pre-fill the title from the filename on first pick.
    setValue('title', chosen.name.replace(/\.[^.]+$/, ''), { shouldDirty: true });
  }

  const submit = handleSubmit(async (data) => {
    setServerError(null);
    const meta: UploadDocumentMeta = {
      title: data.title,
      category: data.category,
      description: data.description || undefined,
      documentDate: data.documentDate || undefined,
      expiryDate: data.expiryDate || undefined,
      tags: (data.tags ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };
    try {
      if (mode === 'create') {
        if (!file) {
          setFileError('Choose a file to upload.');
          return;
        }
        await onUpload!(file, meta);
      } else if (document) {
        await onSaveMetadata!(document.id, {
          title: meta.title,
          category: meta.category,
          description: meta.description,
          documentDate: meta.documentDate,
          expiryDate: meta.expiryDate,
          tags: meta.tags,
        });
      }
      onClose();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    }
  });

  return (
    <FormShell
      open
      onClose={onClose}
      size="md"
      height="natural"
      mode={mode}
      isDirty={dirty}
      pending={isSubmitting}
    >
      <FormHeader
        title={mode === 'create' ? 'Upload document' : `Edit ${document?.title ?? 'document'}`}
      />
      <datalist id={CATEGORY_LIST_ID}>
        {DOCUMENT_CATEGORY_SUGGESTIONS.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
        <FormBody>
          {mode === 'create' && (
            <FormSection title="File" description="PDF, Word, Excel, CSV, PNG or JPEG. Up to 25 MB.">
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT_ATTR}
                className="sr-only"
                onChange={handleFileChange}
                aria-label="Choose a document to upload"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <UploadCloud className="size-6 text-muted-foreground" aria-hidden="true" />
                {file ? (
                  <span className="text-sm font-medium text-foreground">
                    {file.name}{' '}
                    <span className="text-muted-foreground">
                      ({formatFileSize(Math.max(1, Math.round(file.size / 1024)))})
                    </span>
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">Click to choose a file</span>
                )}
              </button>
              {fileError && (
                <p role="alert" className="mt-2 text-sm text-destructive">
                  {fileError}
                </p>
              )}
            </FormSection>
          )}

          <FormSection title="Details">
            <Field>
              <FieldLabel htmlFor="doc-title">Title</FieldLabel>
              <Input id="doc-title" {...register('title')} />
              <FieldError errors={[errors.title]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="doc-category">Category</FieldLabel>
              <Input
                id="doc-category"
                list={CATEGORY_LIST_ID}
                placeholder="e.g. VAT, Insurance, Contract"
                {...register('category')}
              />
              <FieldError errors={[errors.category]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="doc-description">Description</FieldLabel>
              <Textarea id="doc-description" rows={2} {...register('description')} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="doc-date">Document date</FieldLabel>
                <Input id="doc-date" type="date" {...register('documentDate')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="doc-expiry">Expiry date</FieldLabel>
                <Input id="doc-expiry" type="date" {...register('expiryDate')} />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="doc-tags">Tags</FieldLabel>
              <Input id="doc-tags" placeholder="Comma separated" {...register('tags')} />
            </Field>
          </FormSection>
        </FormBody>

        <FormFooter error={serverError}>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || (mode === 'create' && !file)}>
            {mode === 'create' ? (isSubmitting ? 'Uploading…' : 'Upload') : 'Save changes'}
          </Button>
        </FormFooter>
      </form>
    </FormShell>
  );
}
