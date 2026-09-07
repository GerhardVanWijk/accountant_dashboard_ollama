import type { ID, ISODateString } from './common';

/**
 * One administrative company record — a CIPC/registration document, SARS
 * letter, VAT certificate, contract, insurance policy, licence, bank
 * confirmation letter, B-BBEE certificate, board resolution, etc.
 *
 * Mirrors `public.company_documents` (migration 0071). The file BYTES live
 * in the private `company-documents` Storage bucket at `storagePath`; this
 * record is metadata only. Deliberately distinct from the transactional
 * accounting documents (invoices, bills, delivery/return notes, credit
 * notes, quotes) which keep their own tables and modules.
 */
export interface CompanyDocument {
  id: ID;
  companyId: ID;
  title: string;
  description?: string;
  /** Free text. `DOCUMENT_CATEGORY_SUGGESTIONS` is a hint set, not an allow-list. */
  category: string;
  /** Sanitised original filename, kept for display and the download filename. */
  fileName: string;
  /** `<companyId>/<uuid>.<ext>` in the private bucket. Immutable after upload. */
  storagePath: string;
  mimeType: string;
  /** Bytes. */
  fileSize: number;
  /** The date the document itself is dated (e.g. certificate issue date). */
  documentDate?: ISODateString;
  /** Optional — only meaningful for licences, certificates, insurance, compliance records. */
  expiryDate?: ISODateString;
  tags: string[];
  uploadedBy: ID;
  uploadedAt: ISODateString;
  updatedAt: ISODateString;
  isArchived: boolean;
  archivedAt?: ISODateString;
  archivedBy?: ID;
  metadata: Record<string, unknown>;
}

/** Suggested categories shown in the picker. Not enforced — a company can type its own. */
export const DOCUMENT_CATEGORY_SUGGESTIONS: readonly string[] = [
  'Company registration',
  'CIPC',
  'SARS',
  'VAT',
  'Tax',
  'Contract',
  'Insurance',
  'Policy',
  'Licence',
  'Agreement',
  'Bank confirmation',
  'B-BBEE',
  'Board & shareholder',
  'Employment & HR',
  'Other',
] as const;

export type DocumentExpiryStatus = 'none' | 'ok' | 'expiring_soon' | 'expired';

/** Days-out thresholds that count as "expiring soon" for badges + notifications. */
export const DOCUMENT_EXPIRY_WARN_DAYS = 30;

export function documentExpiryStatus(
  doc: Pick<CompanyDocument, 'expiryDate'>,
  now: Date = new Date(),
): DocumentExpiryStatus {
  if (!doc.expiryDate) return 'none';
  const expiry = new Date(doc.expiryDate);
  const days = Math.floor((expiry.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return 'expired';
  if (days <= DOCUMENT_EXPIRY_WARN_DAYS) return 'expiring_soon';
  return 'ok';
}
