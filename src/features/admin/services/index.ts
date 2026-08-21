import { CompanyService } from './companyService';
import { MockCompanyRepository } from '../repositories/MockCompanyRepository';
import { auditLogService } from '@/services/auditLogService';

export type { CreateCompanyDTO } from './companyService';
export { CompanyService } from './companyService';
export { auditLogService, AuditLogService } from '@/services/auditLogService';

const companyRepository = new MockCompanyRepository();

export const companyService = new CompanyService(companyRepository, auditLogService);
