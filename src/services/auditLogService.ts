import type { AuditAction, AuditLogEntry, ID } from '@/types';
import type {
  AuditLogPage,
  AuditLogPageQuery,
  IAuditLogRepository,
} from '@/repositories/IAuditLogRepository';
import { SupabaseAuditLogRepository } from '@/repositories/SupabaseAuditLogRepository';
import { supabase } from '@/config/supabase';

export interface LogEntryInput {
  userId: ID;
  action: AuditAction;
  module: string;
  recordType: string;
  recordId: ID;
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string;
}

/**
 * Cross-cutting audit trail service (docs/SA_ACCOUNTING_MASTER_SPEC.md §37).
 * Lives at the top level (not under one feature) because it has no single
 * domain owner — Accounting, Sales, Purchases, Banking, and Admin all write
 * to it and the Admin module's Audit page (src/features/admin/pages/AuditPage.tsx)
 * reads from it. Same top-level placement precedent as
 * IBillRepository/IInvoiceRepository/IPurchaseOrderRepository.
 */
export class AuditLogService {
  constructor(private readonly repository: IAuditLogRepository) {}

  async log(input: LogEntryInput): Promise<AuditLogEntry> {
    const now = new Date().toISOString();
    return this.repository.create({
      ...input,
      id: '',
      createdAt: now,
      updatedAt: now,
    });
  }

  async getAll(): Promise<AuditLogEntry[]> {
    return this.repository.getAll();
  }

  /** Filtered, newest-first, paged — the Audit Trail page never loads the whole history. */
  async getPage(query: AuditLogPageQuery): Promise<AuditLogPage> {
    return this.repository.getPage(query);
  }

  /**
   * Headline counts for the Audit Trail KPI cards, all since `sinceIso`
   * (default: 30 days ago). Four count-only queries, never row payloads.
   */
  async getKpis(sinceIso?: string): Promise<{
    events: number;
    financialPostings: number;
    securityAdmin: number;
    reversals: number;
  }> {
    const from = sinceIso ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
    const base = { page: 0, pageSize: 1, from } as const;
    const [events, financialPostings, securityAdmin, reversals] = await Promise.all([
      this.repository.getPage({ ...base }),
      this.repository.getPage({
        ...base,
        actions: ['posted', 'bank_reconciled', 'stock_take_posted', 'supplier_return_posted', 'delivery_note_posted', 'return_note_posted', 'tax_return_finalised', 'period_closed', 'financial_year_closed'],
      }),
      this.repository.getPage({ ...base, module: 'admin' }),
      this.repository.getPage({ ...base, actions: ['reversed', 'cancelled', 'delivery_note_cancelled', 'return_note_cancelled'] }),
    ]);
    return {
      events: events.total,
      financialPostings: financialPostings.total,
      securityAdmin: securityAdmin.total,
      reversals: reversals.total,
    };
  }

  async getForRecord(recordType: string, recordId: ID): Promise<AuditLogEntry[]> {
    return this.repository.getByRecord(recordType, recordId);
  }
}

/**
 * Singleton every feature service should depend on rather than importing
 * repositories directly. Supabase-backed since Phase C
 * (docs/SUPABASE_MIGRATION_GUIDE.md) — because this is one shared singleton
 * every feature writes to, swapping it also moves every still-Mock module's
 * (Sales/Purchases/Banking/Payroll/Tax — Phase D+, not started) audit calls
 * onto the network; SupabaseAuditLogRepository's doc comment covers why its
 * columns stay permissive (`text`, not uuid/FK/enum) specifically to keep
 * those calls working unchanged.
 */
export const auditLogService = new AuditLogService(new SupabaseAuditLogRepository(supabase));
