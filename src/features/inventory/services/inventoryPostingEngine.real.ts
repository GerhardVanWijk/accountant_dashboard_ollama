import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  InventoryReversalRequest,
  InventoryTransactionExecutor,
  InventoryTransactionRequest,
  InventoryTransactionResult,
} from './inventoryPostingEngine';

/**
 * The production executor: one Supabase RPC call per transaction. Every write
 * (movements, balances, WAC, journal entry, audit, idempotency log) happens in
 * the single implicit transaction of `public.post_inventory_transaction`
 * (SECURITY INVOKER — RLS applies; `company_id` comes from `get_my_company_id()`,
 * never the client). See migration 0031.
 */
export class RealInventoryTransactionExecutor implements InventoryTransactionExecutor {
  constructor(private readonly client: SupabaseClient) {}

  async execute(request: InventoryTransactionRequest): Promise<InventoryTransactionResult> {
    const { data, error } = await this.client.rpc('post_inventory_transaction', {
      p_posting_key: request.postingKey,
      p_source_type: request.sourceType,
      p_source_id: request.sourceId,
      p_movement_date: request.movementDate,
      p_created_by: request.createdBy,
      p_lines: request.lines
        .filter((l) => !l.nonStock)
        .map((l) => ({
          product_id: l.productId,
          warehouse_id: l.warehouseId,
          quantity_delta: l.quantityDelta,
          costing_mode: l.costingMode,
          unit_cost_in: l.unitCostIn ?? null,
          unit_cost_override: l.unitCostOverride ?? null,
          movement_type: l.movementType ?? null,
          source_document_line_id: l.sourceDocumentLineId ?? null,
          inventory_account_id: l.inventoryAccountId ?? null,
          contra_account_id: l.contraAccountId ?? null,
        })),
      p_extra_journal: (request.extraJournal ?? []).map((l) => ({
        account_id: l.accountId,
        debit: l.debit,
        credit: l.credit,
        description: l.description ?? null,
      })),
      p_journal: {
        source: request.journal?.source ?? request.sourceType,
        memo: request.journal?.memo ?? null,
        currency: request.journal?.currency ?? 'ZAR',
      },
      p_audit: request.audit
        ? {
            user_id: request.createdBy,
            action: request.audit.action,
            module: request.audit.module ?? 'inventory',
            record_type: request.audit.recordType ?? request.sourceType,
            record_id: request.audit.recordId ?? request.sourceId,
            reason: request.audit.reason ?? null,
            new_value: request.audit.newValue ?? null,
          }
        : null,
    });
    if (error) throw new Error(`post_inventory_transaction: ${error.message}`);
    return mapResult(data);
  }

  async reverse(request: InventoryReversalRequest): Promise<InventoryTransactionResult> {
    const { data, error } = await this.client.rpc('reverse_inventory_transaction', {
      p_posting_key: request.postingKey,
      p_original_posting_key: request.originalPostingKey,
      p_movement_date: request.movementDate,
      p_created_by: request.createdBy,
      p_reason: request.reason ?? null,
      p_audit: request.audit
        ? {
            user_id: request.createdBy,
            action: request.audit.action,
            record_type: request.audit.recordType ?? null,
            record_id: request.audit.recordId ?? null,
          }
        : null,
    });
    if (error) throw new Error(`reverse_inventory_transaction: ${error.message}`);
    return mapResult(data);
  }
}

function mapResult(data: unknown): InventoryTransactionResult {
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    idempotent: Boolean(d.idempotent),
    transactionLogId: String(d.transaction_log_id ?? ''),
    journalEntryId: d.journal_entry_id ? String(d.journal_entry_id) : undefined,
    movementIds: Array.isArray(d.movement_ids) ? (d.movement_ids as string[]) : [],
    warnings: Array.isArray(d.warnings) ? (d.warnings as string[]) : [],
  };
}
