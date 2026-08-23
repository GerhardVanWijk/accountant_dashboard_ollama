import type { SupabaseClient } from '@supabase/supabase-js';
import type { Address, ID, Supplier, SupplierBankDetails } from '@/types';
import type { ISupplierRepository } from './ISupplierRepository';
import { resolveDefaultCompanyId } from '@/repositories/resolveDefaultCompanyId';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface SupplierRow {
  id: string;
  supplier_number: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: Address | null;
  tax_number: string | null;
  currency: string;
  balance: number;
  status: string;
  notes: string | null;
  credit_limit: number | null;
  payment_terms: string | null;
  category: string | null;
  on_hold: boolean;
  bank_details: SupplierBankDetails | null;
  contact_person: string | null;
  remittance_address: Address | null;
  payment_method: string | null;
  settlement_discount_percent: number | null;
  created_at: string;
  updated_at: string;
}

function rowToSupplier(row: SupplierRow): Supplier {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    supplierNumber: row.supplier_number,
    name: row.name,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    address: row.address ?? undefined,
    taxNumber: row.tax_number ?? undefined,
    currency: row.currency,
    balance: Number(row.balance),
    status: row.status as Supplier['status'],
    notes: row.notes ?? undefined,
    creditLimit: row.credit_limit === null ? undefined : Number(row.credit_limit),
    paymentTerms: (row.payment_terms as Supplier['paymentTerms']) ?? undefined,
    category: (row.category as Supplier['category']) ?? undefined,
    onHold: row.on_hold,
    bankDetails: row.bank_details ?? undefined,
    contactPerson: row.contact_person ?? undefined,
    remittanceAddress: row.remittance_address ?? undefined,
    paymentMethod: (row.payment_method as Supplier['paymentMethod']) ?? undefined,
    settlementDiscountPercent: row.settlement_discount_percent === null ? undefined : Number(row.settlement_discount_percent),
  };
}

function supplierToRow(entity: Partial<Supplier>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.supplierNumber !== undefined) row.supplier_number = entity.supplierNumber;
  if (entity.name !== undefined) row.name = entity.name;
  if (entity.email !== undefined) row.email = entity.email;
  if (entity.phone !== undefined) row.phone = entity.phone;
  if (entity.address !== undefined) row.address = entity.address;
  if (entity.taxNumber !== undefined) row.tax_number = entity.taxNumber;
  if (entity.currency !== undefined) row.currency = entity.currency;
  if (entity.balance !== undefined) row.balance = entity.balance;
  if (entity.status !== undefined) row.status = entity.status;
  if (entity.notes !== undefined) row.notes = entity.notes;
  if (entity.creditLimit !== undefined) row.credit_limit = entity.creditLimit;
  if (entity.paymentTerms !== undefined) row.payment_terms = entity.paymentTerms;
  if (entity.category !== undefined) row.category = entity.category;
  if (entity.onHold !== undefined) row.on_hold = entity.onHold;
  if (entity.bankDetails !== undefined) row.bank_details = entity.bankDetails;
  if (entity.contactPerson !== undefined) row.contact_person = entity.contactPerson;
  if (entity.remittanceAddress !== undefined) row.remittance_address = entity.remittanceAddress;
  if (entity.paymentMethod !== undefined) row.payment_method = entity.paymentMethod;
  if (entity.settlementDiscountPercent !== undefined) row.settlement_discount_percent = entity.settlementDiscountPercent;
  return row;
}

/**
 * Supabase-backed ISupplierRepository (docs/SUPABASE_MIGRATION_GUIDE.md
 * Phase D). Resolves "the" company internally at create() time — same
 * single-tenant pattern as SupabaseAccountRepository/SupabaseCustomerRepository.
 */
export class SupabaseSupplierRepository implements ISupplierRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseSupplierRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<Supplier[]> {
    const { data, error } = await this.client.from('suppliers').select('*').order('supplier_number', { ascending: true });
    if (error) throw new Error(`SupabaseSupplierRepository.getAll: ${error.message}`);
    return (data as SupplierRow[]).map(rowToSupplier);
  }

  async getById(id: ID): Promise<Supplier | undefined> {
    const { data, error } = await this.client.from('suppliers').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseSupplierRepository.getById: ${error.message}`);
    }
    return data ? rowToSupplier(data as SupplierRow) : undefined;
  }

  async create(entity: Supplier): Promise<Supplier> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('suppliers')
      .insert({ ...supplierToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseSupplierRepository.create: ${error.message}`);
    return rowToSupplier(data as SupplierRow);
  }

  async update(id: ID, patch: Partial<Supplier>): Promise<Supplier> {
    const { data, error } = await this.client.from('suppliers').update(supplierToRow(patch)).eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(`SupabaseSupplierRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseSupplierRepository: supplier "${id}" not found`);
    return rowToSupplier(data as SupplierRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('suppliers').delete().eq('id', id);
    if (error) throw new Error(`SupabaseSupplierRepository.delete: ${error.message}`);
  }
}
