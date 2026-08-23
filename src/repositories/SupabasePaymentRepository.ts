import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID, Payment, PaymentAllocation } from '@/types';
import type { IPaymentRepository } from './IPaymentRepository';
import { resolveDefaultCompanyId } from './resolveDefaultCompanyId';
import { isInvalidUuidError } from './supabaseErrors';

interface PaymentRow {
  id: string;
  payment_number: string;
  supplier_id: string;
  bank_account_id: string | null;
  date: string;
  method: string;
  reference: string | null;
  amount: number;
  allocations: PaymentAllocation[];
  unallocated_amount: number;
  currency: string;
  journal_entry_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function rowToPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    paymentNumber: row.payment_number,
    supplierId: row.supplier_id,
    bankAccountId: row.bank_account_id ?? undefined,
    date: row.date,
    method: row.method as Payment['method'],
    reference: row.reference ?? undefined,
    amount: Number(row.amount),
    allocations: row.allocations ?? [],
    unallocatedAmount: Number(row.unallocated_amount),
    currency: row.currency,
    journalEntryId: row.journal_entry_id ?? undefined,
    notes: row.notes ?? undefined,
  };
}

function paymentToRow(entity: Partial<Payment>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.paymentNumber !== undefined) row.payment_number = entity.paymentNumber;
  if (entity.supplierId !== undefined) row.supplier_id = entity.supplierId;
  if (entity.bankAccountId !== undefined) row.bank_account_id = entity.bankAccountId;
  if (entity.date !== undefined) row.date = entity.date;
  if (entity.method !== undefined) row.method = entity.method;
  if (entity.reference !== undefined) row.reference = entity.reference;
  if (entity.amount !== undefined) row.amount = entity.amount;
  if (entity.allocations !== undefined) row.allocations = entity.allocations;
  if (entity.unallocatedAmount !== undefined) row.unallocated_amount = entity.unallocatedAmount;
  if (entity.currency !== undefined) row.currency = entity.currency;
  if (entity.journalEntryId !== undefined) row.journal_entry_id = entity.journalEntryId;
  if (entity.notes !== undefined) row.notes = entity.notes;
  return row;
}

/**
 * Supabase-backed IPaymentRepository (docs/SUPABASE_MIGRATION_GUIDE.md
 * Phase E). Resolves "the" company internally at create() time.
 */
export class SupabasePaymentRepository implements IPaymentRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabasePaymentRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<Payment[]> {
    const { data, error } = await this.client.from('payments').select('*').order('date', { ascending: true });
    if (error) throw new Error(`SupabasePaymentRepository.getAll: ${error.message}`);
    return (data as PaymentRow[]).map(rowToPayment);
  }

  async getById(id: ID): Promise<Payment | undefined> {
    const { data, error } = await this.client.from('payments').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabasePaymentRepository.getById: ${error.message}`);
    }
    return data ? rowToPayment(data as PaymentRow) : undefined;
  }

  async create(entity: Payment): Promise<Payment> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('payments')
      .insert({ ...paymentToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabasePaymentRepository.create: ${error.message}`);
    return rowToPayment(data as PaymentRow);
  }

  async update(id: ID, patch: Partial<Payment>): Promise<Payment> {
    const { data, error } = await this.client.from('payments').update(paymentToRow(patch)).eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(`SupabasePaymentRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabasePaymentRepository: payment "${id}" not found`);
    return rowToPayment(data as PaymentRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('payments').delete().eq('id', id);
    if (error) throw new Error(`SupabasePaymentRepository.delete: ${error.message}`);
  }
}
