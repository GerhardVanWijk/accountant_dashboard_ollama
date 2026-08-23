import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuditAccessResult, AuditLogAccessEntry, ID } from '@/types';
import type { IAuditLogAccessRepository, LogAccessDTO } from './IAuditLogAccessRepository';

interface AuditLogAccessRow {
  id: string;
  actor_id: string | null;
  action: string;
  table_name: string;
  company_id: string | null;
  result: string;
  detail: Record<string, unknown> | null;
  occurred_at: string;
}

function rowToEntry(row: AuditLogAccessRow): AuditLogAccessEntry {
  return {
    id: row.id,
    actorId: row.actor_id ?? undefined,
    action: row.action,
    tableName: row.table_name,
    companyId: row.company_id ?? undefined,
    result: row.result as AuditAccessResult,
    detail: row.detail ?? undefined,
    occurredAt: row.occurred_at,
  };
}

/** Satisfies IAuditLogAccessRepository against the real `audit_logs_access` table (migration 0010). See src/types/accessAudit.ts for the "best-effort, not automatic interception" caveat. */
export class SupabaseAuditLogAccessRepository implements IAuditLogAccessRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getByCompany(companyId: ID, limit: number): Promise<AuditLogAccessEntry[]> {
    const { data, error } = await this.client
      .from('audit_logs_access')
      .select('*')
      .eq('company_id', companyId)
      .order('occurred_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`SupabaseAuditLogAccessRepository.getByCompany: ${error.message}`);
    return (data as AuditLogAccessRow[]).map(rowToEntry);
  }

  async getByUser(userId: ID, companyId: ID): Promise<AuditLogAccessEntry[]> {
    const { data, error } = await this.client
      .from('audit_logs_access')
      .select('*')
      .eq('actor_id', userId)
      .eq('company_id', companyId)
      .order('occurred_at', { ascending: false });
    if (error) throw new Error(`SupabaseAuditLogAccessRepository.getByUser: ${error.message}`);
    return (data as AuditLogAccessRow[]).map(rowToEntry);
  }

  async log(entry: LogAccessDTO): Promise<void> {
    const { error } = await this.client.from('audit_logs_access').insert({
      actor_id: entry.actorId,
      action: entry.action,
      table_name: entry.tableName,
      company_id: entry.companyId ?? null,
      result: entry.result,
      detail: entry.detail ?? null,
    });
    if (error) throw new Error(`SupabaseAuditLogAccessRepository.log: ${error.message}`);
  }
}
