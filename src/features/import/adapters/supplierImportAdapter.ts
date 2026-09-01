import type { Supplier, SupplierPaymentTerms } from '@/types';
import { supplierService, type CreateSupplierDTO } from '@/features/suppliers/services/supplierService';
import type { ImportAdapter, ImportExecuteOptions, ImportExecutionSummary, ImportFieldDef, ImportRowOutcome, ImportRowResult, RowMessage } from '../types';
import { asBoolean, asString, requireField } from '../normalize';

export interface SupplierImportRow {
  supplierNumber?: string;
  name: string;
  email?: string;
  phone?: string;
  taxNumber?: string;
  addressLine1?: string;
  addressCity?: string;
  addressCountry?: string;
  paymentTerms?: SupplierPaymentTerms;
  active: boolean;
}

export interface SupplierImportContext {
  existingByNumber: Map<string, Supplier>;
  existingByName: Map<string, Supplier>;
  nextSequence: number;
}

const PAYMENT_TERMS_VALUES = new Set<SupplierPaymentTerms>(['Net14', 'Net30', 'EOM']);

export const SUPPLIER_IMPORT_FIELDS: ImportFieldDef[] = [
  { key: 'supplierNumber', label: 'Supplier Code', type: 'string', aliases: ['Supplier Number', 'Vendor Code', 'Code'] },
  { key: 'name', label: 'Name', required: true, type: 'string', aliases: ['Supplier Name', 'Vendor Name', 'Company Name'] },
  { key: 'email', label: 'Email', type: 'string', aliases: ['Email Address'] },
  { key: 'phone', label: 'Phone', type: 'string', aliases: ['Phone Number', 'Telephone', 'Contact Number'] },
  { key: 'taxNumber', label: 'VAT Number', type: 'string', aliases: ['Tax Number', 'VAT No'] },
  { key: 'addressLine1', label: 'Address', type: 'string', aliases: ['Street Address'] },
  { key: 'addressCity', label: 'City', type: 'string', aliases: ['Town'] },
  { key: 'addressCountry', label: 'Country', type: 'string', aliases: [] },
  { key: 'paymentTerms', label: 'Payment Terms', type: 'string', aliases: ['Terms'] },
  { key: 'active', label: 'Active', type: 'boolean', aliases: ['Status', 'Is Active'] },
];

function normalizeRow(
  raw: Record<string, string | number | boolean | Date | undefined>,
  _rowNumber: number,
  _ctx: SupplierImportContext,
): { normalized?: SupplierImportRow; messages: RowMessage[] } {
  const messages: RowMessage[] = [];
  const name = asString(raw.name);
  requireField(name, 'name', 'Name', messages);

  const paymentTermsRaw = asString(raw.paymentTerms);
  let paymentTerms: SupplierPaymentTerms | undefined;
  if (paymentTermsRaw) {
    const match = [...PAYMENT_TERMS_VALUES].find((v) => v.toLowerCase() === paymentTermsRaw.replace(/\s+/g, '').toLowerCase());
    if (match) paymentTerms = match;
    else messages.push({ field: 'paymentTerms', message: `Payment Terms "${paymentTermsRaw}" is not recognized (expected Net14, Net30 or EOM) — left unset.`, severity: 'warning' });
  }

  if (messages.some((m) => m.severity === 'error')) return { messages };

  return {
    normalized: {
      supplierNumber: asString(raw.supplierNumber),
      name: name!,
      email: asString(raw.email),
      phone: asString(raw.phone),
      taxNumber: asString(raw.taxNumber),
      addressLine1: asString(raw.addressLine1),
      addressCity: asString(raw.addressCity),
      addressCountry: asString(raw.addressCountry),
      paymentTerms,
      active: asBoolean(raw.active) ?? true,
    },
    messages,
  };
}

function detectDuplicates(rows: ImportRowResult<SupplierImportRow>[], ctx: SupplierImportContext): ImportRowResult<SupplierImportRow>[] {
  const seenNumbers = new Set<string>();
  const seenNames = new Set<string>();
  return rows.map((row) => {
    if (!row.normalized || row.severity === 'error') return row;
    const number = row.normalized.supplierNumber?.trim().toLowerCase();
    const name = row.normalized.name.trim().toLowerCase();
    if (number && (seenNumbers.has(number) || ctx.existingByNumber.has(number))) {
      seenNumbers.add(number);
      return { ...row, severity: 'duplicate', messages: [...row.messages, { field: 'supplierNumber', message: `Supplier code "${row.normalized.supplierNumber}" already exists.`, severity: 'warning' }] };
    }
    if (seenNames.has(name) || ctx.existingByName.has(name)) {
      seenNames.add(name);
      return { ...row, severity: 'duplicate', messages: [...row.messages, { field: 'name', message: `A supplier named "${row.normalized.name}" already exists.`, severity: 'warning' }] };
    }
    if (number) seenNumbers.add(number);
    seenNames.add(name);
    return row;
  });
}

async function execute(rows: ImportRowResult<SupplierImportRow>[], ctx: SupplierImportContext, options: ImportExecuteOptions): Promise<ImportExecutionSummary> {
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
        (r.supplierNumber && ctx.existingByNumber.get(r.supplierNumber.trim().toLowerCase())) ??
        ctx.existingByName.get(r.name.trim().toLowerCase());
      if (!existing) {
        errored++;
        outcomes.push({ rowNumber: row.rowNumber, outcome: 'error', message: 'Could not resolve which existing supplier to update.' });
        continue;
      }
      try {
        // Bank details are never touched by an import — spec §14: "Do not
        // overwrite sensitive supplier information silently." A supplier's
        // banking details are only ever entered by hand.
        await supplierService.updateSupplier(existing.id, buildPatch(r, existing));
        updated++;
        outcomes.push({ rowNumber: row.rowNumber, outcome: 'updated' });
      } catch (err) {
        errored++;
        outcomes.push({ rowNumber: row.rowNumber, outcome: 'error', message: err instanceof Error ? err.message : 'Failed to update supplier.' });
      }
      continue;
    }

    try {
      const supplierNumber = r.supplierNumber ?? `SUPP-${String(sequence).padStart(4, '0')}`;
      sequence++;
      const dto: CreateSupplierDTO = {
        supplierNumber,
        name: r.name,
        email: r.email,
        phone: r.phone,
        taxNumber: r.taxNumber,
        address: buildAddress(r),
        currency: 'ZAR',
        balance: 0,
        status: r.active ? 'active' : 'inactive',
        paymentTerms: r.paymentTerms,
      };
      await supplierService.createSupplier(dto);
      imported++;
      outcomes.push({ rowNumber: row.rowNumber, outcome: 'imported' });
    } catch (err) {
      errored++;
      outcomes.push({ rowNumber: row.rowNumber, outcome: 'error', message: err instanceof Error ? err.message : 'Failed to create supplier.' });
    }
  }

  return { rowsRead: rows.length, imported, updated, skipped, errored, rows: outcomes };
}

function buildAddress(r: SupplierImportRow): Supplier['address'] {
  if (!r.addressLine1 && !r.addressCity) return undefined;
  return { line1: r.addressLine1 ?? '', city: r.addressCity ?? '', country: r.addressCountry ?? 'South Africa' };
}

function buildPatch(r: SupplierImportRow, existing: Supplier): Partial<Supplier> {
  return {
    name: r.name,
    email: r.email ?? existing.email,
    phone: r.phone ?? existing.phone,
    taxNumber: r.taxNumber ?? existing.taxNumber,
    address: buildAddress(r) ?? existing.address,
    status: r.active ? 'active' : 'inactive',
    paymentTerms: r.paymentTerms ?? existing.paymentTerms,
  };
}

/**
 * Supplier import — master data only, never posts to the GL (Phase 6
 * spec §14). Bank details are intentionally not an import field at all —
 * they can only ever be entered by hand, so a spreadsheet can never
 * silently redirect a supplier's payments.
 */
export const supplierImportAdapter: ImportAdapter<SupplierImportRow, SupplierImportContext> = {
  id: 'suppliers',
  label: 'Suppliers',
  description: 'Create or update supplier records — code, name, contact details and terms.',
  permission: { feature: 'supplier_management', action: 'import' },
  fields: SUPPLIER_IMPORT_FIELDS,
  async loadContext() {
    const suppliers = await supplierService.getSuppliers();
    return {
      existingByNumber: new Map(suppliers.map((s) => [s.supplierNumber.trim().toLowerCase(), s])),
      existingByName: new Map(suppliers.map((s) => [s.name.trim().toLowerCase(), s])),
      nextSequence: suppliers.length + 1,
    };
  },
  normalizeRow,
  detectDuplicates,
  execute,
};
