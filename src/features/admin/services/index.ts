import { CompanyService } from './companyService';
import { SupabaseCompanyRepository } from '../repositories/SupabaseCompanyRepository';
import { supabase } from '@/config/supabase';
import { auditLogService } from '@/services/auditLogService';

export type { CreateCompanyDTO } from './companyService';
export { CompanyService } from './companyService';
export { auditLogService, AuditLogService } from '@/services/auditLogService';

const companyRepository = new SupabaseCompanyRepository(supabase);

export const companyService = new CompanyService(companyRepository, auditLogService);
