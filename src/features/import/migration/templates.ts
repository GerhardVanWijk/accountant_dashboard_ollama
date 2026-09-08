import type { ImportFieldDef } from '../types';
import { CHART_OF_ACCOUNTS_IMPORT_FIELDS } from '../adapters/chartOfAccountsImportAdapter';
import { CUSTOMER_IMPORT_FIELDS } from '../adapters/customerImportAdapter';
import { SUPPLIER_IMPORT_FIELDS } from '../adapters/supplierImportAdapter';
import { PRODUCT_IMPORT_FIELDS } from '../adapters/productImportAdapter';

export interface ImportTemplate {
  id: string;
  label: string;
  fields: ImportFieldDef[];
}

/** One entry per downloadable template. Headers only, `required` fields flagged with a trailing " *" — never pre-filled with sample client data. */
export const IMPORT_TEMPLATES: ImportTemplate[] = [
  { id: 'chart_of_accounts', label: 'Chart of Accounts', fields: CHART_OF_ACCOUNTS_IMPORT_FIELDS },
  { id: 'customers', label: 'Customers', fields: CUSTOMER_IMPORT_FIELDS },
  { id: 'suppliers', label: 'Suppliers', fields: SUPPLIER_IMPORT_FIELDS },
  { id: 'products', label: 'Products', fields: PRODUCT_IMPORT_FIELDS },
];

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Spreadsheet-formula-injection safety (Part 47): a header/value starting with =, +, - or @ is neutralized with a leading apostrophe so a spreadsheet application never interprets it as a formula. Template headers are static text controlled by this codebase, so this is precautionary, not because any of them currently trigger it. */
function csvSafeCell(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

export function buildTemplateCSV(template: ImportTemplate): string {
  const header = template.fields.map((f) => csvEscape(csvSafeCell(f.required ? `${f.label} *` : f.label))).join(',');
  return `${header}\r\n`;
}

export function downloadTemplateCSV(template: ImportTemplate): void {
  const csv = buildTemplateCSV(template);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${template.id}-template.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
