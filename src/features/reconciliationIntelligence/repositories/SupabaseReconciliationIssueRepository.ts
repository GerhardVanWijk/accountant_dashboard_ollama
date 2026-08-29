import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID, ReconciliationEvidenceData, ReconciliationIssue } from '@/types';
import type { IReconciliationIssueRepository } from './IReconciliationIssueRepository';
import { resolveDefaultCompanyId } from '@/repositories/resolveDefaultCompanyId';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface ReconciliationIssueRow {
  id: string;
  bank_account_id: string;
  statement_date: string;
  issue_type: string;
  severity: string;
  confidence: number;
  effect_amount: number;
  affected_date_from: string | null;
  affected_date_to: string | null;
  related_bank_transaction_ids: string[];
  related_journal_entry_ids: string[];
  related_source_document_ids: string[];
  explanation: string;
  evidence: { label: string; detail?: string }[];
  evidence_data: ReconciliationEvidenceData | null;
  dedupe_key: string | null;
  suggested_resolution: string;
  auto_resolution_safe: boolean;
  status: string;
  resolution_actor_user_id: string | null;
  resolution_date: string | null;
  resolution_reason: string | null;
  created_at: string;
  updated_at: string;
}

function rowToIssue(row: ReconciliationIssueRow): ReconciliationIssue {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    bankAccountId: row.bank_account_id,
    statementDate: row.statement_date,
    issueType: row.issue_type as ReconciliationIssue['issueType'],
    severity: row.severity as ReconciliationIssue['severity'],
    confidence: Number(row.confidence),
    effectAmount: Number(row.effect_amount),
    affectedDateFrom: row.affected_date_from ?? undefined,
    affectedDateTo: row.affected_date_to ?? undefined,
    relatedBankTransactionIds: row.related_bank_transaction_ids ?? [],
    relatedJournalEntryIds: row.related_journal_entry_ids ?? [],
    relatedSourceDocumentIds: row.related_source_document_ids ?? [],
    explanation: row.explanation,
    evidence: row.evidence ?? [],
    evidenceData: row.evidence_data ?? undefined,
    dedupeKey: row.dedupe_key ?? undefined,
    suggestedResolution: row.suggested_resolution,
    autoResolutionSafe: row.auto_resolution_safe,
    status: row.status as ReconciliationIssue['status'],
    resolutionActorUserId: row.resolution_actor_user_id ?? undefined,
    resolutionDate: row.resolution_date ?? undefined,
    resolutionReason: row.resolution_reason ?? undefined,
  };
}

function issueToRow(entity: Partial<ReconciliationIssue>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.bankAccountId !== undefined) row.bank_account_id = entity.bankAccountId;
  if (entity.statementDate !== undefined) row.statement_date = entity.statementDate;
  if (entity.issueType !== undefined) row.issue_type = entity.issueType;
  if (entity.severity !== undefined) row.severity = entity.severity;
  if (entity.confidence !== undefined) row.confidence = entity.confidence;
  if (entity.effectAmount !== undefined) row.effect_amount = entity.effectAmount;
  if (entity.affectedDateFrom !== undefined) row.affected_date_from = entity.affectedDateFrom ?? null;
  if (entity.affectedDateTo !== undefined) row.affected_date_to = entity.affectedDateTo ?? null;
  if (entity.relatedBankTransactionIds !== undefined) row.related_bank_transaction_ids = entity.relatedBankTransactionIds;
  if (entity.relatedJournalEntryIds !== undefined) row.related_journal_entry_ids = entity.relatedJournalEntryIds;
  if (entity.relatedSourceDocumentIds !== undefined) row.related_source_document_ids = entity.relatedSourceDocumentIds;
  if (entity.explanation !== undefined) row.explanation = entity.explanation;
  if (entity.evidence !== undefined) row.evidence = entity.evidence;
  if (entity.evidenceData !== undefined) row.evidence_data = entity.evidenceData;
  if (entity.dedupeKey !== undefined) row.dedupe_key = entity.dedupeKey;
  if (entity.suggestedResolution !== undefined) row.suggested_resolution = entity.suggestedResolution;
  if (entity.autoResolutionSafe !== undefined) row.auto_resolution_safe = entity.autoResolutionSafe;
  if (entity.status !== undefined) row.status = entity.status;
  if (entity.resolutionActorUserId !== undefined) row.resolution_actor_user_id = entity.resolutionActorUserId ?? null;
  if (entity.resolutionDate !== undefined) row.resolution_date = entity.resolutionDate ?? null;
  if (entity.resolutionReason !== undefined) row.resolution_reason = entity.resolutionReason ?? null;
  return row;
}

/**
 * Supabase-backed IReconciliationIssueRepository (migration
 * `0018_reconciliation_investigator`, `reconciliation_issues` table).
 * Mutable CRUD (unlike SupabaseBankReconciliationRepository — status
 * transitions here are a real lifecycle, see IReconciliationIssueRepository's
 * doc comment), same shape as SupabaseFixedAssetRepository. Resolves "the"
 * company internally at create() time — ReconciliationIssue has no
 * companyId field, same single-tenant pattern as every other Phase
 * B/D/F-style repository.
 */
export class SupabaseReconciliationIssueRepository implements IReconciliationIssueRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseReconciliationIssueRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<ReconciliationIssue[]> {
    const { data, error } = await this.client.from('reconciliation_issues').select('*').order('created_at', { ascending: false });
    if (error) throw new Error(`SupabaseReconciliationIssueRepository.getAll: ${error.message}`);
    return (data as ReconciliationIssueRow[]).map(rowToIssue);
  }

  async getById(id: ID): Promise<ReconciliationIssue | undefined> {
    const { data, error } = await this.client.from('reconciliation_issues').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseReconciliationIssueRepository.getById: ${error.message}`);
    }
    return data ? rowToIssue(data as ReconciliationIssueRow) : undefined;
  }

  async getByAccount(bankAccountId: ID): Promise<ReconciliationIssue[]> {
    const { data, error } = await this.client
      .from('reconciliation_issues')
      .select('*')
      .eq('bank_account_id', bankAccountId)
      .order('created_at', { ascending: false });
    if (error) {
      if (isInvalidUuidError(error)) return [];
      throw new Error(`SupabaseReconciliationIssueRepository.getByAccount: ${error.message}`);
    }
    return (data as ReconciliationIssueRow[]).map(rowToIssue);
  }

  async create(entity: ReconciliationIssue): Promise<ReconciliationIssue> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('reconciliation_issues')
      .insert({ ...issueToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseReconciliationIssueRepository.create: ${error.message}`);
    return rowToIssue(data as ReconciliationIssueRow);
  }

  async update(id: ID, patch: Partial<ReconciliationIssue>): Promise<ReconciliationIssue> {
    const { data, error } = await this.client.from('reconciliation_issues').update(issueToRow(patch)).eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(`SupabaseReconciliationIssueRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseReconciliationIssueRepository: issue "${id}" not found`);
    return rowToIssue(data as ReconciliationIssueRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('reconciliation_issues').delete().eq('id', id);
    if (error) throw new Error(`SupabaseReconciliationIssueRepository.delete: ${error.message}`);
  }
}
