import type { Customer, PaymentTerms } from '@/types';
import { customerService, type CreateCustomerDTO } from '@/features/customers/services/customerService';
import type { ImportAdapter, ImportExecuteOptions, ImportExecutionSummary, ImportFieldDef, ImportRowOutcome, ImportRowResult, RowMessage } from '../types';
import { asBoolean, asNumber, asString, requireField } from '../normalize';

export interface CustomerImportRow {
  customerNumber?: string;
  name: string;
  email?: string;
  phone?: string;
  taxNumber?: string;
  addressLine1?: string;
  addressCity?: string;
  addressCountry?: string;
  paymentTerms?: PaymentTerms;
  creditLimit?: number;
  active: boolean;
}

export interface CustomerImportContext {
  existingByNumber: Map<string, Customer>;
  existingByEmail: Map<string, Customer>;
  nextSequence: number;
}

const PAYMENT_TERMS_VALUES = new Set<PaymentTerms>(['COD', 'Net14', 'Net30', 'Net60']);

export const CUSTOMER_IMPORT_FIELDS: ImportFieldDef[] = [
  { key: 'customerNumber', label: 'Customer Code', type: 'string', aliases: ['Customer Number', 'Account Code', 'Code'] },
  { key: 'name', label: 'Name', required: true, type: 'string', aliases: ['Customer Name', 'Company Name', 'Business Name'] },
  { key: 'email', label: 'Email', type: 'string', aliases: ['Email Address'] },
  { key: 'phone', label: 'Phone', type: 'string', aliases: ['Phone Number', 'Telephone', 'Contact Number'] },
  { key: 'taxNumber', label: 'VAT Number', type: 'string', aliases: ['Tax Number', 'VAT No'] },
  { key: 'addressLine1', label: 'Billing Address', type: 'string', aliases: ['Address', 'Street Address'] },
  { key: 'addressCity', label: 'City', type: 'string', aliases: ['Town'] },
  { key: 'addressCountry', label: 'Country', type: 'string', aliases: [] },
  { key: 'paymentTerms', label: 'Payment Terms', type: 'string', aliases: ['Terms'] },
  { key: 'creditLimit', label: 'Credit Limit', type: 'number', aliases: ['Credit Limit Amount'] },
  { key: 'active', label: 'Active', type: 'boolean', aliases: ['Status', 'Is Active'] },
];

function normalizeRow(
  raw: Record<string, string | number | boolean | Date | undefined>,
  _rowNumber: number,
  _ctx: CustomerImportContext,
): { normalized?: CustomerImportRow; messages: RowMessage[] } {
  const messages: RowMessage[] = [];
  const name = asString(raw.name);
  requireField(name, 'name', 'Name', messages);

  const creditLimit = asNumber(raw.creditLimit);
  if (raw.creditLimit !== undefined && creditLimit === undefined) {
    messages.push({ field: 'creditLimit', message: `Credit Limit "${String(raw.creditLimit)}" is not numeric.`, severity: 'error' });
  }

  const paymentTermsRaw = asString(raw.paymentTerms);
  let paymentTerms: PaymentTerms | undefined;
  if (paymentTermsRaw) {
    const match = [...PAYMENT_TERMS_VALUES].find((v) => v.toLowerCase() === paymentTermsRaw.replace(/\s+/g, '').toLowerCase());
    if (match) paymentTerms = match;
    else messages.push({ field: 'paymentTerms', message: `Payment Terms "${paymentTermsRaw}" is not recognized (expected COD, Net14, Net30 or Net60) — left unset.`, severity: 'warning' });
  }

  if (messages.some((m) => m.severity === 'error')) return { messages };

  return {
    normalized: {
      customerNumber: asString(raw.customerNumber),
      name: name!,
      email: asString(raw.email),
      phone: asString(raw.phone),
      taxNumber: asString(raw.taxNumber),
      addressLine1: asString(raw.addressLine1),
      addressCity: asString(raw.addressCity),
      addressCountry: asString(raw.addressCountry),
      paymentTerms,
      creditLimit,
      active: asBoolean(raw.active) ?? true,
    },
    messages,
  };
}

function detectDuplicates(rows: ImportRowResult<CustomerImportRow>[], ctx: CustomerImportContext): ImportRowResult<CustomerImportRow>[] {
  const seenNumbers = new Set<string>();
  const seenEmails = new Set<string>();
  return rows.map((row) => {
    if (!row.normalized || row.severity === 'error') return row;
    const number = row.normalized.customerNumber?.trim().toLowerCase();
    const email = row.normalized.email?.trim().toLowerCase();
    if (number && (seenNumbers.has(number) || ctx.existingByNumber.has(number))) {
      seenNumbers.add(number);
      return { ...row, severity: 'duplicate', messages: [...row.messages, { field: 'customerNumber', message: `Customer code "${row.normalized.customerNumber}" already exists.`, severity: 'warning' }] };
    }
    if (email && (seenEmails.has(email) || ctx.existingByEmail.has(email))) {
      seenEmails.add(email);
      return { ...row, severity: 'duplicate', messages: [...row.messages, { field: 'email', message: `A customer with email "${row.normalized.email}" already exists.`, severity: 'warning' }] };
    }
    if (number) seenNumbers.add(number);
    if (email) seenEmails.add(email);
    return row;
  });
}

async function execute(rows: ImportRowResult<CustomerImportRow>[], ctx: CustomerImportContext, options: ImportExecuteOptions): Promise<ImportExecutionSummary> {
  const outcomes: ImportRowOutcome[] = [];
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let errored = 0;
  let sequence = ctx.nextSequence;

  for (const row of rows) {
    if (row.severity === 'skipped') {
      skipped++;
      outcomes.push({ rowNumber: row.rowNumber, outcome: 'skipped' });
      continue;
    }
    if (row.severity === 'error' || !row.normalized) {
      errored++;
      outcomes.push({ rowNumber: row.rowNumber, outcome: 'error', message: row.messages.find((m) => m.severity === 'error')?.message ?? 'Invalid row.' });
      continue;
    }
    const r = row.normalized;

    if (row.severity === 'duplicate') {
      if (options.duplicateStrategy === 'skip') {
        skipped++;
        outcomes.push({ rowNumber: row.rowNumber, outcome: 'skipped', message: 'Already exists.' });
        continue;
      }
      if (options.duplicateStrategy === 'error') {
        errored++;
        outcomes.push({ rowNumber: row.rowNumber, outcome: 'error', message: 'Already exists.' });
        continue;
      }
      const existing =
        (r.customerNumber && ctx.existingByNumber.get(r.customerNumber.trim().toLowerCase())) ??
        (r.email && ctx.existingByEmail.get(r.email.trim().toLowerCase()));
      if (!existing) {
        errored++;
        outcomes.push({ rowNumber: row.rowNumber, outcome: 'error', message: 'Could not resolve which existing customer to update.' });
        continue;
      }
      try {
        await customerService.updateCustomer(existing.id, buildPatch(r, existing));
        updated++;
        outcomes.push({ rowNumber: row.rowNumber, outcome: 'updated' });
      } catch (err) {
        errored++;
        outcomes.push({ rowNumber: row.rowNumber, outcome: 'error', message: err instanceof Error ? err.message : 'Failed to update customer.' });
      }
      continue;
    }

    try {
      const customerNumber = r.customerNumber ?? `CUST-${String(sequence).padStart(4, '0')}`;
      sequence++;
      const dto: CreateCustomerDTO = {
        customerNumber,
        name: r.name,
        email: r.email,
        phone: r.phone,
        taxNumber: r.taxNumber,
        billingAddress: buildAddress(r),
        currency: 'ZAR',
        balance: 0,
        status: r.active ? 'active' : 'inactive',
        paymentTerms: r.paymentTerms,
        creditLimit: r.creditLimit,
      };
      await customerService.createCustomer(dto);
      imported++;
      outcomes.push({ rowNumber: row.rowNumber, outcome: 'imported' });
    } catch (err) {
      errored++;
      outcomes.push({ rowNumber: row.rowNumber, outcome: 'error', message: err instanceof Error ? err.message : 'Failed to create customer.' });
    }
  }

  return { rowsRead: rows.length, imported, updated, skipped, errored, rows: outcomes };
}

function buildAddress(r: CustomerImportRow): Customer['billingAddress'] {
  if (!r.addressLine1 && !r.addressCity) return undefined;
  return { line1: r.addressLine1 ?? '', city: r.addressCity ?? '', country: r.addressCountry ?? 'South Africa' };
}

function buildPatch(r: CustomerImportRow, existing: Customer): Partial<Customer> {
  return {
    name: r.name,
    email: r.email ?? existing.email,
    phone: r.phone ?? existing.phone,
    taxNumber: r.taxNumber ?? existing.taxNumber,
    billingAddress: buildAddress(r) ?? existing.billingAddress,
    status: r.active ? 'active' : 'inactive',
    paymentTerms: r.paymentTerms ?? existing.paymentTerms,
    creditLimit: r.creditLimit ?? existing.creditLimit,
  };
}

/**
 * Customer import — master data only, never posts to the GL (Phase 6
 * spec §13). A row with no Customer Code gets a sequential `CUST-000N`
 * code, the same convention every other document register in this
 * codebase uses for its own number.
 */
export const customerImportAdapter: ImportAdapter<CustomerImportRow, CustomerImportContext> = {
  id: 'customers',
  label: 'Customers',
  description: 'Create or update customer records — code, name, contact details and terms.',
  permission: { feature: 'customer_management', action: 'import' },
  fields: CUSTOMER_IMPORT_FIELDS,
  async loadContext() {
    const customers = await customerService.getCustomers();
    return {
      existingByNumber: new Map(customers.map((c) => [c.customerNumber.trim().toLowerCase(), c])),
      existingByEmail: new Map(customers.filter((c) => c.email).map((c) => [c.email!.trim().toLowerCase(), c])),
      nextSequence: customers.length + 1,
    };
  },
  normalizeRow,
  detectDuplicates,
  execute,
};
