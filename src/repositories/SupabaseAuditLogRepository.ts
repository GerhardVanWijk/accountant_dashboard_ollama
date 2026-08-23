import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuditLogEntry, ID } from '@/types';
import type { IAuditLogRepository } from './IAuditLogRepository';
import { isInvalidUuidError } from './supabaseErrors';

interface AuditLogRow {
  id: string;
  user_id: string;
  action: string;
  module: string;
  record_type: string;
  record_id: string;
  previous_value: unknown;
  new_value: unknown;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

function rowToAuditLogEntry(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    userId: row.user_id,
    action: row.action as AuditLogEntry['action'],
    module: row.module,
    recordType: row.record_type,
    recordId: row.record_id,
    previousValue: row.previous_value ?? undefined,
    newValue: row.new_value ?? undefined,
    reason: row.reason ?? undefined,
  };
}

/**
 * Supabase-backed IAuditLogRepository (docs/SUPABASE_MIGRATION_GUIDE.md
 * Phase C).
 *
 * FLAGGED DEVIATION: `user_id`/`record_id`/`action` are plain `text`
 * columns in the DB, not `uuid`/FK/enum. `auditLogService`
 * (src/services/auditLogService.ts) is ONE shared top-level singleton every
 * feature writes to — including Sales/Purchases/Banking/Payroll/Tax, still
 * Mock-backed (Phase D+, not started), which still pass Mock-style ids
 * (e.g. "inv_0001") and the `SYSTEM_USER_ID = 'system'` sentinel (no real
 * authenticated session yet — docs/LEDGER_ARCHITECTURE.md's "Audit trail"
 * section). A strict uuid/FK/enum column would make every one of those
 * still-Mock modules' audit calls throw the moment this singleton is
 * swapped to Supabase, long before their own migration phase. `action` is
 * additionally documented as non-exhaustive/growing
 * (src/types/auditLog.ts's `AuditAction` comment), so a Postgres enum would
 * need its own migration every time a new action is introduced.
 * `company_id` is still resolved and stored internally (the same
 * single-company-today pattern as SupabaseAccountRepository/
 * SupabaseJournalEntryRepository) so RLS can scope reads correctly.
 */
export class SupabaseAuditLogRepository implements IAuditLogRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (this.cachedCompanyId) return this.cachedCompanyId;
    const { data, error } = await this.client
      .from('companies')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`SupabaseAuditLogRepository: failed to resolve the company for a new audit log entry: ${error.message}`);
    if (!data) throw new Error('SupabaseAuditLogRepository: no Company exists yet — create one before writing audit log entries.');
    this.cachedCompanyId = data.id as ID;
    return this.cachedCompanyId;
  }

  async getAll(): Promise<AuditLogEntry[]> {
    const { data, error } = await this.client.from('audit_log_entries').select('*').order('created_at', { ascending: false });
    if (error) throw new Error(`SupabaseAuditLogRepository.getAll: ${error.message}`);
    return (data as AuditLogRow[]).map(rowToAuditLogEntry);
  }

  async getById(id: ID): Promise<AuditLogEntry | undefined> {
    const { data, error } = await this.client.from('audit_log_entries').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseAuditLogRepository.getById: ${error.message}`);
    }
    return data ? rowToAuditLogEntry(data as AuditLogRow) : undefined;
  }

  async getByRecord(recordType: string, recordId: ID): Promise<AuditLogEntry[]> {
    const { data, error } = await this.client
      .from('audit_log_entries')
      .select('*')
      .eq('record_type', recordType)
      .eq('record_id', recordId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`SupabaseAuditLogRepository.getByRecord: ${error.message}`);
    return (data as AuditLogRow[]).map(rowToAuditLogEntry);
  }

  async create(entity: AuditLogEntry): Promise<AuditLogEntry> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('audit_log_entries')
      .insert({
        company_id: companyId,
        user_id: entity.userId,
        action: entity.action,
        module: entity.module,
        record_type: entity.recordType,
        record_id: entity.recordId,
        previous_value: entity.previousValue ?? null,
        new_value: entity.newValue ?? null,
        reason: entity.reason ?? null,
      })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseAuditLogRepository.create: ${error.message}`);
    return rowToAuditLogEntry(data as AuditLogRow);
  }
}
