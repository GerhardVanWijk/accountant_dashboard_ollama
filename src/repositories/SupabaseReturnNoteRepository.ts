import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReturnNote, ReturnNoteLineItem, ID } from '@/types';
import type { IReturnNoteRepository } from './IReturnNoteRepository';
import { resolveDefaultCompanyId } from './resolveDefaultCompanyId';
import { isInvalidUuidError } from './supabaseErrors';

interface ReturnNoteRow {
  id: string;
  return_note_number: string;
  delivery_note_id: string;
  sales_order_id: string;
  customer_id: string;
  warehouse_id: string;
  return_date: string;
  status: string;
  line_items: ReturnNoteLineItem[];
  notes: string | null;
  journal_entry_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToReturnNote(row: ReturnNoteRow): ReturnNote {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    returnNoteNumber: row.return_note_number,
    deliveryNoteId: row.delivery_note_id,
    salesOrderId: row.sales_order_id,
    customerId: row.customer_id,
    warehouseId: row.warehouse_id,
    returnDate: row.return_date,
    status: row.status as ReturnNote['status'],
    lineItems: row.line_items ?? [],
    notes: row.notes ?? undefined,
    journalEntryId: row.journal_entry_id ?? undefined,
  };
}

function returnNoteToRow(entity: Partial<ReturnNote>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.returnNoteNumber !== undefined) row.return_note_number = entity.returnNoteNumber;
  if (entity.deliveryNoteId !== undefined) row.delivery_note_id = entity.deliveryNoteId;
  if (entity.salesOrderId !== undefined) row.sales_order_id = entity.salesOrderId;
  if (entity.customerId !== undefined) row.customer_id = entity.customerId;
  if (entity.warehouseId !== undefined) row.warehouse_id = entity.warehouseId;
  if (entity.returnDate !== undefined) row.return_date = entity.returnDate;
  if (entity.status !== undefined) row.status = entity.status;
  if (entity.lineItems !== undefined) row.line_items = entity.lineItems;
  if (entity.notes !== undefined) row.notes = entity.notes;
  if (entity.journalEntryId !== undefined) row.journal_entry_id = entity.journalEntryId;
  return row;
}

/**
 * Supabase-backed IReturnNoteRepository (Phase 5D, migration 0057).
 * Resolves "the" company internally at create() time, same pattern as
 * `SupabaseDeliveryNoteRepository`. `update()` is used only for the `draft`
 * lifecycle — `ReturnNoteService.postReturnNote()` calls the
 * `post_return_note` RPC directly via the Supabase client, then re-reads
 * through this repository.
 */
export class SupabaseReturnNoteRepository implements IReturnNoteRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseReturnNoteRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<ReturnNote[]> {
    const { data, error } = await this.client
      .from('return_notes')
      .select('*')
      .order('return_date', { ascending: true });
    if (error) throw new Error(`SupabaseReturnNoteRepository.getAll: ${error.message}`);
    return (data as ReturnNoteRow[]).map(rowToReturnNote);
  }

  async getById(id: ID): Promise<ReturnNote | undefined> {
    const { data, error } = await this.client.from('return_notes').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseReturnNoteRepository.getById: ${error.message}`);
    }
    return data ? rowToReturnNote(data as ReturnNoteRow) : undefined;
  }

  async getByDeliveryNoteId(deliveryNoteId: ID): Promise<ReturnNote[]> {
    const { data, error } = await this.client
      .from('return_notes')
      .select('*')
      .eq('delivery_note_id', deliveryNoteId)
      .order('return_date', { ascending: true });
    if (error) {
      if (isInvalidUuidError(error)) return [];
      throw new Error(`SupabaseReturnNoteRepository.getByDeliveryNoteId: ${error.message}`);
    }
    return (data as ReturnNoteRow[]).map(rowToReturnNote);
  }

  async getBySalesOrderId(salesOrderId: ID): Promise<ReturnNote[]> {
    const { data, error } = await this.client
      .from('return_notes')
      .select('*')
      .eq('sales_order_id', salesOrderId)
      .order('return_date', { ascending: true });
    if (error) {
      if (isInvalidUuidError(error)) return [];
      throw new Error(`SupabaseReturnNoteRepository.getBySalesOrderId: ${error.message}`);
    }
    return (data as ReturnNoteRow[]).map(rowToReturnNote);
  }

  async getByCustomerId(customerId: ID): Promise<ReturnNote[]> {
    const { data, error } = await this.client
      .from('return_notes')
      .select('*')
      .eq('customer_id', customerId)
      .order('return_date', { ascending: true });
    if (error) {
      if (isInvalidUuidError(error)) return [];
      throw new Error(`SupabaseReturnNoteRepository.getByCustomerId: ${error.message}`);
    }
    return (data as ReturnNoteRow[]).map(rowToReturnNote);
  }

  async create(entity: ReturnNote): Promise<ReturnNote> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('return_notes')
      .insert({ ...returnNoteToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseReturnNoteRepository.create: ${error.message}`);
    return rowToReturnNote(data as ReturnNoteRow);
  }

  async update(id: ID, patch: Partial<ReturnNote>): Promise<ReturnNote> {
    const { data, error } = await this.client
      .from('return_notes')
      .update(returnNoteToRow(patch))
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`SupabaseReturnNoteRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseReturnNoteRepository: return note "${id}" not found`);
    return rowToReturnNote(data as ReturnNoteRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('return_notes').delete().eq('id', id);
    if (error) throw new Error(`SupabaseReturnNoteRepository.delete: ${error.message}`);
  }
}
