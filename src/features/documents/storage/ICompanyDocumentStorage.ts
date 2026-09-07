/**
 * The private `company-documents` Storage bucket (migration 0071),
 * abstracted so the service can be unit-tested without a live client and
 * so the bucket name lives in exactly one place.
 */
export interface ICompanyDocumentStorage {
  /** Uploads bytes to `path` (`<companyId>/<uuid>.<ext>`). Write-once — never overwrites. */
  upload(path: string, file: Blob, contentType: string): Promise<void>;
  /** A short-lived signed URL for downloading/previewing. The bucket has no public URL surface. */
  createSignedUrl(path: string, expiresInSeconds: number): Promise<string>;
  /** Removes the object. RLS allows this for superuser only. */
  remove(path: string): Promise<void>;
}
