import { supabase } from '@/config/supabase';
import { SupabaseCompanyDocumentRepository } from '../repositories/SupabaseCompanyDocumentRepository';
import { SupabaseCompanyDocumentStorage } from '../storage/SupabaseCompanyDocumentStorage';
import { CompanyDocumentService } from './companyDocumentService';

export { CompanyDocumentService } from './companyDocumentService';

export const companyDocumentService = new CompanyDocumentService(
  new SupabaseCompanyDocumentRepository(supabase),
  new SupabaseCompanyDocumentStorage(supabase),
);
