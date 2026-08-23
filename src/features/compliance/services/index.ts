import { PublicInterestScoreService } from './publicInterestScoreService';
import { ReportingStandardService } from './reportingStandardService';
import { SupabasePublicInterestScoreRepository } from '../repositories/SupabasePublicInterestScoreRepository';
import { SupabaseReportingStandardVersionRepository } from '../repositories/SupabaseReportingStandardVersionRepository';
import { supabase } from '@/config/supabase';
import { accountService, journalEntryService, financialYearService } from '@/features/accounting/services';
import { employeeService } from '@/features/employees/services';
import { companyService } from '@/features/admin/services';
import { auditLogService } from '@/services/auditLogService';

export type { CalculatePublicInterestScoreInput } from './publicInterestScoreService';
export { PublicInterestScoreService } from './publicInterestScoreService';
export type { CreateReportingStandardVersionDTO } from './reportingStandardService';
export { ReportingStandardService } from './reportingStandardService';
export * from './complianceDeterminations';

/**
 * Wires PublicInterestScoreService to the real singletons every other
 * posting/reporting module in this codebase already uses (real GL data via
 * accountService/journalEntryService, real Company/Employee/FinancialYear
 * records) — never a second disconnected data source.
 */
const publicInterestScoreRepository = new SupabasePublicInterestScoreRepository(supabase);

export const publicInterestScoreService = new PublicInterestScoreService(
  publicInterestScoreRepository,
  {
    getAccounts: () => accountService.getAccounts(),
    getEntries: () => journalEntryService.getEntries(),
  },
  { getEmployees: () => employeeService.getEmployees() },
  financialYearService,
  companyService,
  auditLogService,
);

const reportingStandardVersionRepository = new SupabaseReportingStandardVersionRepository(supabase);
export const reportingStandardService = new ReportingStandardService(reportingStandardVersionRepository, auditLogService);
