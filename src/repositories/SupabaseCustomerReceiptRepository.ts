import type { SupabaseClient } from '@supabase/supabase-js';
import type { CustomerReceipt, ID, ReceiptAllocation } from '@/types';
import type { ICustomerReceiptRepository } from './ICustomerReceiptRepository';
import { resolveDefaultCompanyId } from './resolveDefaultCompanyId';
import { isInvalidUuidError } from './supabaseErrors';

interface CustomerReceiptRow {
  id: string;
  receipt_number: string;
  customer_id: string;
  bank_account_id: string | null;
  date: string;
  method: string;
  reference: string | null;
  amount: number;
  allocations: ReceiptAllocation[];
  unallocated_amount: number;
  currency: string;
  journal_entry_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function rowToCustomerReceipt(row: CustomerReceiptRow): CustomerReceipt {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    receiptNumber: row.receipt_number,
    customerId: row.customer_id,
    bankAccountId: row.bank_account_id ?? undefined,
    date: row.date,
    method: row.method as CustomerReceipt['method'],
    reference: row.reference ?? undefined,
    amount: Number(row.amount),
    allocations: row.allocations ?? [],
    unallocatedAmount: Number(row.unallocated_amount),
    currency: row.currency,
    journalEntryId: row.journal_entry_id ?? undefined,
    notes: row.notes ?? undefined,
  };
}

function customerReceiptToRow(entity: Partial<CustomerReceipt>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.receiptNumber !== undefined) row.receipt_number = entity.receiptNumber;
  if (entity.customerId !== undefined) row.customer_id = entity.customerId;
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
 * Supabase-backed ICustomerReceiptRepository (docs/SUPABASE_MIGRATION_GUIDE.md
 * Phase E). Resolves "the" company internally at create() time. Named to
 * match its interface (ICustomerReceiptRepository) rather than the
 * shorter "SupabaseReceiptRepository" — consistent with every other
 * repository in this codebase being named after its interface exactly.
 */
export class SupabaseCustomerReceiptRepository implements ICustomerReceiptRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseCustomerReceiptRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<CustomerReceipt[]> {
    const { data, error } = await this.client.from('customer_receipts').select('*').order('date', { ascending: true });
    if (error) throw new Error(`SupabaseCustomerReceiptRepository.getAll: ${error.message}`);
    return (data as CustomerReceiptRow[]).map(rowToCustomerReceipt);
  }

  async getById(id: ID): Promise<CustomerReceipt | undefined> {
    const { data, error } = await this.client.from('customer_receipts').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseCustomerReceiptRepository.getById: ${error.message}`);
    }
    return data ? rowToCustomerReceipt(data as CustomerReceiptRow) : undefined;
  }

  async create(entity: CustomerReceipt): Promise<CustomerReceipt> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('customer_receipts')
      .insert({ ...customerReceiptToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseCustomerReceiptRepository.create: ${error.message}`);
    return rowToCustomerReceipt(data as CustomerReceiptRow);
  }

  async update(id: ID, patch: Partial<CustomerReceipt>): Promise<CustomerReceipt> {
    const { data, error } = await this.client
      .from('customer_receipts')
      .update(customerReceiptToRow(patch))
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`SupabaseCustomerReceiptRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseCustomerReceiptRepository: customer receipt "${id}" not found`);
    return rowToCustomerReceipt(data as CustomerReceiptRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('customer_receipts').delete().eq('id', id);
    if (error) throw new Error(`SupabaseCustomerReceiptRepository.delete: ${error.message}`);
  }
}
