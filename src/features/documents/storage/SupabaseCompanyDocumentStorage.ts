import type { SupabaseClient } from '@supabase/supabase-js';
import type { ICompanyDocumentStorage } from './ICompanyDocumentStorage';

export const COMPANY_DOCUMENTS_BUCKET = 'company-documents';

/** Supabase Storage implementation of the private company-documents bucket. */
export class SupabaseCompanyDocumentStorage implements ICompanyDocumentStorage {
  constructor(private readonly client: SupabaseClient) {}

  async upload(path: string, file: Blob, contentType: string): Promise<void> {
    const { error } = await this.client.storage
      .from(COMPANY_DOCUMENTS_BUCKET)
      .upload(path, file, { contentType, upsert: false });
    if (error) throw new Error(`Document upload failed: ${error.message}`);
  }

  async createSignedUrl(path: string, expiresInSeconds: number): Promise<string> {
    const { data, error } = await this.client.storage
      .from(COMPANY_DOCUMENTS_BUCKET)
      .createSignedUrl(path, expiresInSeconds);
    if (error || !data?.signedUrl) {
      throw new Error(`Could not create a download link: ${error?.message ?? 'unknown error'}`);
    }
    return data.signedUrl;
  }

  async remove(path: string): Promise<void> {
    const { error } = await this.client.storage.from(COMPANY_DOCUMENTS_BUCKET).remove([path]);
    if (error) throw new Error(`Could not remove the stored file: ${error.message}`);
  }
}
