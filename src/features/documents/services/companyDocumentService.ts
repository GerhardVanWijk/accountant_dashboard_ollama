import type { CompanyDocument, ID } from '@/types';
import type {
  ICompanyDocumentRepository,
  UpdateCompanyDocumentInput,
} from '../repositories/ICompanyDocumentRepository';
import type { ICompanyDocumentStorage } from '../storage/ICompanyDocumentStorage';

/** Company-records allow-list. SVG / HTML / any active format is deliberately excluded. */
export const ALLOWED_DOCUMENT_TYPES: readonly { mime: string; ext: string; label: string }[] = [
  { mime: 'application/pdf', ext: 'pdf', label: 'PDF' },
  { mime: 'application/msword', ext: 'doc', label: 'Word (.doc)' },
  {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ext: 'docx',
    label: 'Word (.docx)',
  },
  { mime: 'application/vnd.ms-excel', ext: 'xls', label: 'Excel (.xls)' },
  {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ext: 'xlsx',
    label: 'Excel (.xlsx)',
  },
  { mime: 'text/csv', ext: 'csv', label: 'CSV' },
  { mime: 'image/png', ext: 'png', label: 'PNG image' },
  { mime: 'image/jpeg', ext: 'jpg', label: 'JPEG image' },
];

export const MAX_DOCUMENT_BYTES = 26_214_400; // 25 MiB — mirrors the DB CHECK + bucket limit

const ALLOWED_MIME = new Set(ALLOWED_DOCUMENT_TYPES.map((t) => t.mime));
const ALLOWED_EXT = new Set(ALLOWED_DOCUMENT_TYPES.map((t) => t.ext));
export const ACCEPT_ATTR = ALLOWED_DOCUMENT_TYPES.map((t) => `.${t.ext}`).join(',');

export interface UploadDocumentMeta {
  title: string;
  description?: string;
  category: string;
  documentDate?: string;
  expiryDate?: string;
  tags?: string[];
}

/** A minimal structural stand-in for the browser `File` — keeps the service testable. */
export interface UploadFile {
  name: string;
  size: number;
  type: string;
  slice?: Blob['slice'];
}

/** Strips path components and anything that isn't a safe filename character. */
export function sanitizeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? raw;
  const cleaned = base
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/_{2,}/g, '_')
    .trim();
  return cleaned.slice(0, 255) || 'document';
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export interface UploadValidationError {
  ok: false;
  message: string;
}
export type UploadValidationResult = { ok: true } | UploadValidationError;

/** Client-side gate; the bucket's MIME list + the table's CHECK constraint are the real enforcement. */
export function validateUploadFile(file: Pick<UploadFile, 'name' | 'size' | 'type'>): UploadValidationResult {
  if (file.size <= 0) return { ok: false, message: 'That file is empty.' };
  if (file.size > MAX_DOCUMENT_BYTES) {
    return { ok: false, message: 'Files must be 25 MB or smaller.' };
  }
  const ext = extensionOf(file.name);
  if (!ALLOWED_EXT.has(ext)) {
    return {
      ok: false,
      message: `“.${ext || 'unknown'}” files aren’t accepted. Allowed: ${ALLOWED_DOCUMENT_TYPES.map((t) => t.label).join(', ')}.`,
    };
  }
  // Browsers sometimes report an empty or generic type; fall back to the extension.
  if (file.type && !ALLOWED_MIME.has(file.type)) {
    return { ok: false, message: `This file’s type (${file.type}) isn’t an accepted company-document format.` };
  }
  return { ok: true };
}

function mimeForExtension(ext: string): string {
  return ALLOWED_DOCUMENT_TYPES.find((t) => t.ext === ext)?.mime ?? 'application/octet-stream';
}

/**
 * Company Documents — the administrative record repository (migration
 * 0071). Upload orchestration: validate → put bytes in the private bucket
 * → write the metadata row. If the row write fails the just-uploaded
 * object is removed so no orphan is left. Audit rows for
 * upload/archive/restore/metadata-change/delete are written by the DB
 * trigger, not here, so coverage can't be bypassed.
 */
export class CompanyDocumentService {
  constructor(
    private readonly repository: ICompanyDocumentRepository,
    private readonly storage: ICompanyDocumentStorage,
  ) {}

  async list(companyId: ID, options?: { includeArchived?: boolean }): Promise<CompanyDocument[]> {
    const all = await this.repository.listByCompany(companyId);
    return options?.includeArchived ? all : all.filter((d) => !d.isArchived);
  }

  async upload(
    companyId: ID,
    uploaderId: ID,
    file: UploadFile,
    meta: UploadDocumentMeta,
  ): Promise<CompanyDocument> {
    const validation = validateUploadFile(file);
    if (!validation.ok) throw new Error(validation.message);
    if (!meta.title.trim()) throw new Error('Give the document a title.');
    if (!meta.category.trim()) throw new Error('Choose a category.');

    const ext = extensionOf(file.name);
    const contentType = file.type && ALLOWED_MIME.has(file.type) ? file.type : mimeForExtension(ext);
    const storagePath = `${companyId}/${crypto.randomUUID()}.${ext}`;

    await this.storage.upload(storagePath, file as unknown as Blob, contentType);

    try {
      return await this.repository.create({
        companyId,
        title: meta.title.trim(),
        description: meta.description?.trim() || undefined,
        category: meta.category.trim(),
        fileName: sanitizeFileName(file.name),
        storagePath,
        mimeType: contentType,
        fileSize: file.size,
        documentDate: meta.documentDate || undefined,
        expiryDate: meta.expiryDate || undefined,
        tags: (meta.tags ?? []).map((t) => t.trim()).filter(Boolean),
        uploadedBy: uploaderId,
        metadata: {},
      });
    } catch (err) {
      // Roll back the orphaned object — best effort; original error wins.
      await this.storage.remove(storagePath).catch(() => undefined);
      throw err;
    }
  }

  /** A short-lived signed URL for download/preview. Default 5 minutes. */
  async getDownloadUrl(doc: Pick<CompanyDocument, 'storagePath'>, expiresInSeconds = 300): Promise<string> {
    return this.storage.createSignedUrl(doc.storagePath, expiresInSeconds);
  }

  async updateMetadata(id: ID, patch: UpdateCompanyDocumentInput): Promise<CompanyDocument> {
    const metaOnly = { ...patch };
    delete metaOnly.isArchived;
    return this.repository.update(id, metaOnly);
  }

  archive(id: ID): Promise<CompanyDocument> {
    return this.repository.update(id, { isArchived: true });
  }

  restore(id: ID): Promise<CompanyDocument> {
    return this.repository.update(id, { isArchived: false });
  }

  /**
   * Permanent removal — superuser only (RLS enforces; a company user's call
   * fails). Removes the metadata row (audit trigger fires) then the object.
   */
  async deleteForever(doc: Pick<CompanyDocument, 'id' | 'storagePath'>): Promise<void> {
    await this.repository.remove(doc.id);
    await this.storage.remove(doc.storagePath).catch(() => undefined);
  }
}
