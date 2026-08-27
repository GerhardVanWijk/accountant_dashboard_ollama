import { ReconciliationInvestigatorService } from './reconciliationInvestigatorService';
import { ReconciliationIssueResolutionService } from './reconciliationIssueResolutionService';
import { SupabaseReconciliationIssueRepository } from '../repositories/SupabaseReconciliationIssueRepository';
import { bankAccountService, bankTransactionService, bankReconciliationService } from '@/features/banking/services';
import { journalEntryService } from '@/features/accounting/services';
import { auditLogService } from '@/services/auditLogService';
import { supabase } from '@/config/supabase';

export { ReconciliationInvestigatorService } from './reconciliationInvestigatorService';
export type { InvestigationResult, BankAccountLookup, BankTransactionLookup, BankReconciliationLookup, SummaryComputer } from './reconciliationInvestigatorService';
export { ReconciliationIssueResolutionService } from './reconciliationIssueResolutionService';
export { computeReconciliationHealth } from './reconciliationHealthService';
export type { ReconciliationHealth } from './reconciliationHealthService';

/**
 * Wires the investigator/resolution services against the real, already-live
 * singletons every other feature already uses (bankAccountService/
 * bankTransactionService/bankReconciliationService/journalEntryService/
 * auditLogService) — never a second, disconnected instance of any of them
 * (the "two-disconnected-singletons" bug class this codebase has hit and
 * fixed twice before, see docs/KNOWN_ISSUES.md). `reconciliationIssueRepository`
 * is Supabase-backed from the start (migration `0018_reconciliation_investigator`).
 */
const reconciliationIssueRepository = new SupabaseReconciliationIssueRepository(supabase);

export const reconciliationInvestigatorService = new ReconciliationInvestigatorService(
  reconciliationIssueRepository,
  bankAccountService,
  bankTransactionService,
  bankReconciliationService,
  journalEntryService,
  bankReconciliationService,
);

export const reconciliationIssueResolutionService = new ReconciliationIssueResolutionService(reconciliationIssueRepository, auditLogService);
