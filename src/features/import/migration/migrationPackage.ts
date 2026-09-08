import { accountService } from '@/features/accounting/services';
import { customerService } from '@/features/customers/services/customerService';
import { supplierService } from '@/features/suppliers/services/supplierService';
import { productService } from '@/features/inventory/services/productService';
import { buildCSV } from '@/features/export/csvExport';
import type { ExportDataset } from '@/features/export/types';

/** Bumped only if the section shapes below change incompatibly — Part 40: "only exports explicitly labelled Migration-Compatible should be guaranteed re-importable." */
export const MIGRATION_PACKAGE_SCHEMA_VERSION = '1.0.0';
export const MIGRATION_PACKAGE_VERSION = '1.0.0';

export interface MigrationPackageManifest {
  packageVersion: string;
  schemaVersion: string;
  generatedAt: string;
  sourceCompanyId: string;
  sourceCompanyName: string;
  sections: { key: string; label: string; recordCount: number; hash: string }[];
}

export interface MigrationPackage {
  manifest: MigrationPackageManifest;
  /** sectionKey -> CSV text (Part 37: manifest.json + *.csv, not a database dump). */
  sections: Record<string, string>;
}

async function sha256HexText(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Builds an Vertex migration/backup export package (Part 37) — a versioned,
 * structured bundle of the company's current master + Chart of Accounts
 * data, NEVER a raw database dump and NEVER any secret/auth material (no
 * Supabase keys, tokens, or session data are read or included — every
 * field below comes from the same read-only service calls the rest of the
 * app already uses for these entities).
 */
export async function buildMigrationPackage(companyId: string, companyName: string): Promise<MigrationPackage> {
  const [accounts, customers, suppliers, products] = await Promise.all([
    accountService.getAccounts(),
    customerService.getCustomers(),
    supplierService.getSuppliers(),
    productService.getProducts(),
  ]);

  const coaDataset: ExportDataset<(typeof accounts)[number]> = {
    title: 'Chart of Accounts', columns: [
      { key: 'code', header: 'Account Code', accessor: (r) => r.code },
      { key: 'name', header: 'Account Name', accessor: (r) => r.name },
      { key: 'type', header: 'Account Type', accessor: (r) => r.type },
      { key: 'subType', header: 'Category', accessor: (r) => r.subType ?? '' },
      { key: 'active', header: 'Active', accessor: (r) => (r.isActive ? 'true' : 'false') },
    ], rows: accounts, filename: 'chart_of_accounts',
  };
  const customersDataset: ExportDataset<(typeof customers)[number]> = {
    title: 'Customers', columns: [
      { key: 'code', header: 'Customer Code', accessor: (r) => r.customerNumber },
      { key: 'name', header: 'Name', accessor: (r) => r.name },
      { key: 'email', header: 'Email', accessor: (r) => r.email ?? '' },
      { key: 'phone', header: 'Phone', accessor: (r) => r.phone ?? '' },
      { key: 'taxNumber', header: 'VAT Number', accessor: (r) => r.taxNumber ?? '' },
      { key: 'status', header: 'Status', accessor: (r) => r.status },
    ], rows: customers, filename: 'customers',
  };
  const suppliersDataset: ExportDataset<(typeof suppliers)[number]> = {
    title: 'Suppliers', columns: [
      { key: 'code', header: 'Supplier Code', accessor: (r) => r.supplierNumber },
      { key: 'name', header: 'Name', accessor: (r) => r.name },
      { key: 'email', header: 'Email', accessor: (r) => r.email ?? '' },
      { key: 'phone', header: 'Phone', accessor: (r) => r.phone ?? '' },
      { key: 'taxNumber', header: 'VAT Number', accessor: (r) => r.taxNumber ?? '' },
      { key: 'status', header: 'Status', accessor: (r) => r.status },
    ], rows: suppliers, filename: 'suppliers',
  };
  const inventoryDataset: ExportDataset<(typeof products)[number]> = {
    title: 'Inventory', columns: [
      { key: 'sku', header: 'SKU', accessor: (r) => r.sku },
      { key: 'name', header: 'Product Name', accessor: (r) => r.name },
      { key: 'sellingPrice', header: 'Selling Price', accessor: (r) => r.unitPrice },
      { key: 'costPrice', header: 'Cost Price', accessor: (r) => r.costPrice ?? '' },
      { key: 'status', header: 'Status', accessor: (r) => r.status },
    ], rows: products, filename: 'inventory',
  };

  const sectionDefs: { key: string; label: string; dataset: ExportDataset<unknown>; count: number }[] = [
    { key: 'chart_of_accounts', label: 'Chart of Accounts', dataset: coaDataset as ExportDataset<unknown>, count: accounts.length },
    { key: 'customers', label: 'Customers', dataset: customersDataset as ExportDataset<unknown>, count: customers.length },
    { key: 'suppliers', label: 'Suppliers', dataset: suppliersDataset as ExportDataset<unknown>, count: suppliers.length },
    { key: 'inventory', label: 'Inventory', dataset: inventoryDataset as ExportDataset<unknown>, count: products.length },
  ];

  const sections: Record<string, string> = {};
  const manifestSections: MigrationPackageManifest['sections'] = [];
  for (const def of sectionDefs) {
    const csv = buildCSV(def.dataset);
    sections[def.key] = csv;
    manifestSections.push({ key: def.key, label: def.label, recordCount: def.count, hash: await sha256HexText(csv) });
  }

  return {
    manifest: {
      packageVersion: MIGRATION_PACKAGE_VERSION,
      schemaVersion: MIGRATION_PACKAGE_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      sourceCompanyId: companyId,
      sourceCompanyName: companyName,
      sections: manifestSections,
    },
    sections,
  };
}

export function downloadMigrationPackage(pkg: MigrationPackage): void {
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `vertex-migration-package-${pkg.manifest.sourceCompanyName.replace(/[^A-Za-z0-9-]+/g, '_')}-${pkg.manifest.generatedAt.slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface PackageValidationResult {
  valid: boolean;
  errors: string[];
  manifest?: MigrationPackageManifest;
}

/**
 * Validates an uploaded package file (Part 38) — well-formed JSON, a
 * recognized `schemaVersion`, every listed section present, and every
 * section's hash matching its content (tamper/corruption evidence). Never
 * merges anything automatically — the caller still drives an explicit
 * target-company + per-section import through the normal ImportWizard
 * adapters.
 */
export async function validateMigrationPackageFile(file: File): Promise<{ result: PackageValidationResult; pkg?: MigrationPackage }> {
  const errors: string[] = [];
  let parsed: MigrationPackage;
  try {
    const text = await file.text();
    parsed = JSON.parse(text) as MigrationPackage;
  } catch {
    return { result: { valid: false, errors: ['This file is not valid JSON — it does not look like an Vertex migration package.'] } };
  }

  if (!parsed.manifest || !parsed.sections) {
    return { result: { valid: false, errors: ['This file is missing a manifest or sections — it does not look like an Vertex migration package.'] } };
  }
  if (parsed.manifest.schemaVersion !== MIGRATION_PACKAGE_SCHEMA_VERSION) {
    errors.push(`Package schema version "${parsed.manifest.schemaVersion}" is not compatible with this Vertex instance (expects "${MIGRATION_PACKAGE_SCHEMA_VERSION}").`);
  }
  for (const section of parsed.manifest.sections ?? []) {
    const content = parsed.sections[section.key];
    if (content === undefined) {
      errors.push(`Section "${section.label}" is listed in the manifest but missing from the package.`);
      continue;
    }
    const actualHash = await sha256HexText(content);
    if (actualHash !== section.hash) {
      errors.push(`Section "${section.label}" failed its integrity check (hash mismatch) — the file may be corrupted or was hand-edited.`);
    }
  }

  return { result: { valid: errors.length === 0, errors, manifest: parsed.manifest }, pkg: errors.length === 0 ? parsed : undefined };
}

/** Wraps one validated package section's CSV text back into a real `File`, so it can be fed straight through the existing, unchanged ImportWizard/adapter pipeline for that import type — no separate package-import parser exists. */
export function extractSectionAsFile(pkg: MigrationPackage, sectionKey: string): File {
  const csv = pkg.sections[sectionKey];
  if (csv === undefined) throw new Error(`Section "${sectionKey}" is not present in this package.`);
  return new File([csv], `${sectionKey}.csv`, { type: 'text/csv' });
}
