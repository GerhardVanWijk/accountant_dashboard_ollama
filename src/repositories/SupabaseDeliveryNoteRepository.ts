import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeliveryNote, DeliveryNoteLineItem, ID } from '@/types';
import type { IDeliveryNoteRepository } from './IDeliveryNoteRepository';
import { resolveDefaultCompanyId } from './resolveDefaultCompanyId';
import { isInvalidUuidError } from './supabaseErrors';

interface DeliveryNoteRow {
  id: string;
  delivery_note_number: string;
  sales_order_id: string;
  customer_id: string;
  warehouse_id: string;
  delivery_date: string;
  status: string;
  line_items: DeliveryNoteLineItem[];
  notes: string | null;
  journal_entry_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToDeliveryNote(row: DeliveryNoteRow): DeliveryNote {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deliveryNoteNumber: row.delivery_note_number,
    salesOrderId: row.sales_order_id,
    customerId: row.customer_id,
    warehouseId: row.warehouse_id,
    deliveryDate: row.delivery_date,
    status: row.status as DeliveryNote['status'],
    lineItems: row.line_items ?? [],
    notes: row.notes ?? undefined,
    journalEntryId: row.journal_entry_id ?? undefined,
  };
}

function deliveryNoteToRow(entity: Partial<DeliveryNote>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.deliveryNoteNumber !== undefined) row.delivery_note_number = entity.deliveryNoteNumber;
  if (entity.salesOrderId !== undefined) row.sales_order_id = entity.salesOrderId;
  if (entity.customerId !== undefined) row.customer_id = entity.customerId;
  if (entity.warehouseId !== undefined) row.warehouse_id = entity.warehouseId;
  if (entity.deliveryDate !== undefined) row.delivery_date = entity.deliveryDate;
  if (entity.status !== undefined) row.status = entity.status;
  if (entity.lineItems !== undefined) row.line_items = entity.lineItems;
  if (entity.notes !== undefined) row.notes = entity.notes;
  if (entity.journalEntryId !== undefined) row.journal_entry_id = entity.journalEntryId;
  return row;
}

/**
 * Supabase-backed IDeliveryNoteRepository (Phase 5C, migration 0052).
 * Resolves "the" company internally at create() time, same pattern as
 * `SupabaseSalesOrderRepository`. `update()` is used only for the `draft`
 * lifecycle (see `DeliveryNoteService`) — RLS + the `post_delivery_note`
 * RPC's own `status <> 'draft'` guard structurally prevent a plain
 * `update()` from ever mutating a posted row's accounting-relevant fields
 * through this repository (the RPC is a SEPARATE write path this class
 * never calls — `DeliveryNoteService.postDeliveryNote()` calls the RPC
 * directly via the Supabase client, then re-reads through this repository).
 */
export class SupabaseDeliveryNoteRepository implements IDeliveryNoteRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseDeliveryNoteRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<DeliveryNote[]> {
    const { data, error } = await this.client
      .from('delivery_notes')
      .select('*')
      .order('delivery_date', { ascending: true });
    if (error) throw new Error(`SupabaseDeliveryNoteRepository.getAll: ${error.message}`);
    return (data as DeliveryNoteRow[]).map(rowToDeliveryNote);
  }

  async getById(id: ID): Promise<DeliveryNote | undefined> {
    const { data, error } = await this.client.from('delivery_notes').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseDeliveryNoteRepository.getById: ${error.message}`);
    }
    return data ? rowToDeliveryNote(data as DeliveryNoteRow) : undefined;
  }

  async getBySalesOrderId(salesOrderId: ID): Promise<DeliveryNote[]> {
    const { data, error } = await this.client
      .from('delivery_notes')
      .select('*')
      .eq('sales_order_id', salesOrderId)
      .order('delivery_date', { ascending: true });
    if (error) {
      if (isInvalidUuidError(error)) return [];
      throw new Error(`SupabaseDeliveryNoteRepository.getBySalesOrderId: ${error.message}`);
    }
    return (data as DeliveryNoteRow[]).map(rowToDeliveryNote);
  }

  async getByCustomerId(customerId: ID): Promise<DeliveryNote[]> {
    const { data, error } = await this.client
      .from('delivery_notes')
      .select('*')
      .eq('customer_id', customerId)
      .order('delivery_date', { ascending: true });
    if (error) {
      if (isInvalidUuidError(error)) return [];
      throw new Error(`SupabaseDeliveryNoteRepository.getByCustomerId: ${error.message}`);
    }
    return (data as DeliveryNoteRow[]).map(rowToDeliveryNote);
  }

  async create(entity: DeliveryNote): Promise<DeliveryNote> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('delivery_notes')
      .insert({ ...deliveryNoteToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseDeliveryNoteRepository.create: ${error.message}`);
    return rowToDeliveryNote(data as DeliveryNoteRow);
  }

  async update(id: ID, patch: Partial<DeliveryNote>): Promise<DeliveryNote> {
    const { data, error } = await this.client
      .from('delivery_notes')
      .update(deliveryNoteToRow(patch))
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`SupabaseDeliveryNoteRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseDeliveryNoteRepository: delivery note "${id}" not found`);
    return rowToDeliveryNote(data as DeliveryNoteRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('delivery_notes').delete().eq('id', id);
    if (error) throw new Error(`SupabaseDeliveryNoteRepository.delete: ${error.message}`);
  }
}
