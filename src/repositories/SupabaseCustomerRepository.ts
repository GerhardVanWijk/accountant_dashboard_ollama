import type { SupabaseClient } from '@supabase/supabase-js';
import type { Address, Customer, CustomerContact, ID } from '@/types';
import type { ICustomerRepository } from './ICustomerRepository';
import { resolveDefaultCompanyId } from './resolveDefaultCompanyId';
import { isInvalidUuidError } from './supabaseErrors';

interface CustomerRow {
  id: string;
  customer_number: string;
  name: string;
  email: string | null;
  phone: string | null;
  billing_address: Address | null;
  shipping_address: Address | null;
  tax_number: string | null;
  currency: string;
  balance: number;
  status: string;
  notes: string | null;
  owner_user_id: string | null;
  credit_limit: number | null;
  payment_terms: string | null;
  credit_hold: boolean;
  tax_status: string | null;
  default_discount_percent: number | null;
  contacts: CustomerContact[];
  created_at: string;
  updated_at: string;
}

function rowToCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    customerNumber: row.customer_number,
    name: row.name,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    billingAddress: row.billing_address ?? undefined,
    shippingAddress: row.shipping_address ?? undefined,
    taxNumber: row.tax_number ?? undefined,
    currency: row.currency,
    balance: Number(row.balance),
    status: row.status as Customer['status'],
    notes: row.notes ?? undefined,
    ownerUserId: row.owner_user_id ?? undefined,
    creditLimit: row.credit_limit === null ? undefined : Number(row.credit_limit),
    paymentTerms: (row.payment_terms as Customer['paymentTerms']) ?? undefined,
    creditHold: row.credit_hold,
    taxStatus: (row.tax_status as Customer['taxStatus']) ?? undefined,
    defaultDiscountPercent: row.default_discount_percent === null ? undefined : Number(row.default_discount_percent),
    contacts: row.contacts ?? [],
  };
}

function customerToRow(entity: Partial<Customer>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.customerNumber !== undefined) row.customer_number = entity.customerNumber;
  if (entity.name !== undefined) row.name = entity.name;
  if (entity.email !== undefined) row.email = entity.email;
  if (entity.phone !== undefined) row.phone = entity.phone;
  if (entity.billingAddress !== undefined) row.billing_address = entity.billingAddress;
  if (entity.shippingAddress !== undefined) row.shipping_address = entity.shippingAddress;
  if (entity.taxNumber !== undefined) row.tax_number = entity.taxNumber;
  if (entity.currency !== undefined) row.currency = entity.currency;
  if (entity.balance !== undefined) row.balance = entity.balance;
  if (entity.status !== undefined) row.status = entity.status;
  if (entity.notes !== undefined) row.notes = entity.notes;
  if (entity.ownerUserId !== undefined) row.owner_user_id = entity.ownerUserId;
  if (entity.creditLimit !== undefined) row.credit_limit = entity.creditLimit;
  if (entity.paymentTerms !== undefined) row.payment_terms = entity.paymentTerms;
  if (entity.creditHold !== undefined) row.credit_hold = entity.creditHold;
  if (entity.taxStatus !== undefined) row.tax_status = entity.taxStatus;
  if (entity.defaultDiscountPercent !== undefined) row.default_discount_percent = entity.defaultDiscountPercent;
  if (entity.contacts !== undefined) row.contacts = entity.contacts;
  return row;
}

/**
 * Supabase-backed ICustomerRepository (docs/SUPABASE_MIGRATION_GUIDE.md
 * Phase D). Resolves "the" company internally at create() time — Customer
 * has no companyId field, same single-tenant pattern as
 * SupabaseAccountRepository (Phase B).
 */
export class SupabaseCustomerRepository implements ICustomerRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseCustomerRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<Customer[]> {
    const { data, error } = await this.client.from('customers').select('*').order('customer_number', { ascending: true });
    if (error) throw new Error(`SupabaseCustomerRepository.getAll: ${error.message}`);
    return (data as CustomerRow[]).map(rowToCustomer);
  }

  async getById(id: ID): Promise<Customer | undefined> {
    const { data, error } = await this.client.from('customers').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseCustomerRepository.getById: ${error.message}`);
    }
    return data ? rowToCustomer(data as CustomerRow) : undefined;
  }

  async create(entity: Customer): Promise<Customer> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('customers')
      .insert({ ...customerToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseCustomerRepository.create: ${error.message}`);
    return rowToCustomer(data as CustomerRow);
  }

  async update(id: ID, patch: Partial<Customer>): Promise<Customer> {
    const { data, error } = await this.client.from('customers').update(customerToRow(patch)).eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(`SupabaseCustomerRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseCustomerRepository: customer "${id}" not found`);
    return rowToCustomer(data as CustomerRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('customers').delete().eq('id', id);
    if (error) throw new Error(`SupabaseCustomerRepository.delete: ${error.message}`);
  }
}
