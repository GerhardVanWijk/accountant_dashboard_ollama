import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, FileJson, Loader2, Upload } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import { useCompany } from '@/features/admin/hooks/useCompany';
import { HelpLink } from '@/features/help/components/HelpLink';
import { downloadCSV } from '@/features/export/csvExport';
import { downloadXLSX } from '@/features/export/xlsxExport';
import { accountService, journalEntryService } from '@/features/accounting/services';
import { customerService } from '@/features/customers/services/customerService';
import { supplierService } from '@/features/suppliers/services/supplierService';
import { invoiceService } from '@/services';
import { billService } from '@/features/purchases/services';
import { invoicesToOpenItems } from '@/features/customers/mock-data/openItems';
import { billsToOpenBills } from '@/features/suppliers/utils/calculateAging';
import { IMPORT_TEMPLATES, downloadTemplateCSV } from '../migration/templates';
import { buildMigrationPackage, downloadMigrationPackage, validateMigrationPackageFile, extractSectionAsFile, type MigrationPackage } from '../migration/migrationPackage';
import { ImportWizard } from '../components/ImportWizard';
import { chartOfAccountsImportAdapter, customerImportAdapter, supplierImportAdapter, productImportAdapter } from '../adapters';
import type { ImportAdapter } from '../types';

interface QuickExport {
  key: string;
  label: string;
  /** True only when a matching adapter in this centre can actually re-import this export's own columns unchanged — never claimed otherwise (Part 40: "do not label an export migration-compatible unless a matching importer can consume it"). */
  migrationCompatible: boolean;
  load: () => Promise<{ columns: { key: string; header: string; accessor: (r: unknown) => string | number | null }[]; rows: unknown[] }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SECTION_ADAPTERS: Record<string, ImportAdapter<any, any>> = {
  chart_of_accounts: chartOfAccountsImportAdapter,
  customers: customerImportAdapter,
  suppliers: supplierImportAdapter,
  inventory: productImportAdapter,
};

export function DataExportCentrePage() {
  const { company } = useCompany();
  const [busyExport, setBusyExport] = useState<string | undefined>(undefined);
  const [pkg, setPkg] = useState<MigrationPackage | undefined>(undefined);
  const [pkgBusy, setPkgBusy] = useState(false);
  const [validated, setValidated] = useState<{ manifest: MigrationPackage['manifest']; pkg?: MigrationPackage; errors: string[] } | undefined>(undefined);
  const [reimportKey, setReimportKey] = useState<{ sectionKey: string; file: File } | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const quickExports: QuickExport[] = [
    {
      key: 'chart_of_accounts', label: 'Chart of Accounts', migrationCompatible: true,
      load: async () => ({ columns: [{ key: 'code', header: 'Code', accessor: (r) => (r as { code: string }).code }, { key: 'name', header: 'Name', accessor: (r) => (r as { name: string }).name }, { key: 'type', header: 'Type', accessor: (r) => (r as { type: string }).type }], rows: await accountService.getAccounts() }),
    },
    {
      key: 'customers', label: 'Customers', migrationCompatible: true,
      load: async () => ({ columns: [{ key: 'code', header: 'Code', accessor: (r) => (r as { customerNumber: string }).customerNumber }, { key: 'name', header: 'Name', accessor: (r) => (r as { name: string }).name }, { key: 'balance', header: 'Balance', accessor: (r) => (r as { balance: number }).balance }], rows: await customerService.getCustomers() }),
    },
    {
      key: 'suppliers', label: 'Suppliers', migrationCompatible: true,
      load: async () => ({ columns: [{ key: 'code', header: 'Code', accessor: (r) => (r as { supplierNumber: string }).supplierNumber }, { key: 'name', header: 'Name', accessor: (r) => (r as { name: string }).name }, { key: 'balance', header: 'Balance', accessor: (r) => (r as { balance: number }).balance }], rows: await supplierService.getSuppliers() }),
    },
    {
      key: 'trial_balance', label: 'Trial Balance', migrationCompatible: true,
      load: async () => {
        const tb = await journalEntryService.computeTrialBalance();
        return {
          columns: [
            { key: 'code', header: 'Account Code', accessor: (r) => (r as { code: string }).code },
            { key: 'name', header: 'Account Name', accessor: (r) => (r as { name: string }).name },
            { key: 'debit', header: 'Debit', accessor: (r) => (r as { debit: number }).debit },
            { key: 'credit', header: 'Credit', accessor: (r) => (r as { credit: number }).credit },
          ],
          rows: tb.rows,
        };
      },
    },
    {
      key: 'general_ledger', label: 'General Ledger (posted)', migrationCompatible: true,
      load: async () => {
        const [entries, accounts] = await Promise.all([journalEntryService.getEntries(), accountService.getAccounts()]);
        const accountById = new Map(accounts.map((a) => [a.id, a]));
        const lineRows = entries
          .filter((e) => e.status === 'posted')
          .flatMap((e) => e.lines.map((l) => ({ date: e.date, journalNumber: e.entryNumber, description: l.description ?? e.memo ?? '', accountCode: accountById.get(l.accountId)?.code ?? l.accountId, debit: l.debit, credit: l.credit })));
        return {
          columns: [
            { key: 'date', header: 'Date', accessor: (r) => (r as { date: string }).date },
            { key: 'journalNumber', header: 'Journal Number', accessor: (r) => (r as { journalNumber: string }).journalNumber },
            { key: 'accountCode', header: 'Account Code', accessor: (r) => (r as { accountCode: string }).accountCode },
            { key: 'description', header: 'Description', accessor: (r) => (r as { description: string }).description },
            { key: 'debit', header: 'Debit', accessor: (r) => (r as { debit: number }).debit },
            { key: 'credit', header: 'Credit', accessor: (r) => (r as { credit: number }).credit },
          ],
          rows: lineRows,
        };
      },
    },
    {
      key: 'ar_opening', label: 'AR Opening (from current aging)', migrationCompatible: true,
      load: async () => {
        const [invoices, customers] = await Promise.all([invoiceService.getInvoices(), customerService.getCustomers()]);
        const customerById = new Map(customers.map((c) => [c.id, c]));
        const rows = invoicesToOpenItems(invoices).map((item) => ({ ...item, customerCode: customerById.get(item.customerId)?.customerNumber ?? item.customerId }));
        return {
          columns: [
            { key: 'customerCode', header: 'Customer Code', accessor: (r) => (r as { customerCode: string }).customerCode },
            { key: 'reference', header: 'Document Number', accessor: (r) => (r as { reference: string }).reference },
            { key: 'issueDate', header: 'Document Date', accessor: (r) => (r as { issueDate: string }).issueDate },
            { key: 'dueDate', header: 'Due Date', accessor: (r) => (r as { dueDate: string }).dueDate },
            { key: 'amount', header: 'Original Amount', accessor: (r) => (r as { amount: number }).amount },
            { key: 'amountOutstanding', header: 'Outstanding Amount', accessor: (r) => (r as { amountOutstanding: number }).amountOutstanding },
          ],
          rows,
        };
      },
    },
    {
      key: 'ap_opening', label: 'AP Opening (from current aging)', migrationCompatible: true,
      load: async () => {
        const [bills, suppliers] = await Promise.all([billService.getBills(), supplierService.getSuppliers()]);
        const supplierById = new Map(suppliers.map((s) => [s.id, s]));
        const openBillIds = new Set(billsToOpenBills(bills).map((b) => b.id));
        const rows = bills
          .filter((b) => openBillIds.has(b.id))
          .map((b) => ({
            supplierCode: supplierById.get(b.supplierId)?.supplierNumber ?? b.supplierId,
            documentNumber: b.billNumber,
            documentDate: b.issueDate,
            dueDate: b.dueDate,
            originalAmount: b.total,
            outstandingAmount: Math.max(0, b.total - b.amountPaid),
          }));
        return {
          columns: [
            { key: 'supplierCode', header: 'Supplier Code', accessor: (r) => (r as { supplierCode: string }).supplierCode },
            { key: 'documentNumber', header: 'Document Number', accessor: (r) => (r as { documentNumber: string }).documentNumber },
            { key: 'documentDate', header: 'Document Date', accessor: (r) => (r as { documentDate: string }).documentDate },
            { key: 'dueDate', header: 'Due Date', accessor: (r) => (r as { dueDate: string }).dueDate },
            { key: 'originalAmount', header: 'Original Amount', accessor: (r) => (r as { originalAmount: number }).originalAmount },
            { key: 'outstandingAmount', header: 'Outstanding Amount', accessor: (r) => (r as { outstandingAmount: number }).outstandingAmount },
          ],
          rows,
        };
      },
    },
  ];

  async function handleExport(item: QuickExport, format: 'csv' | 'xlsx') {
    setBusyExport(item.key);
    setError(undefined);
    try {
      const { columns, rows } = await item.load();
      const dataset = { title: item.label, columns, rows, filename: `${item.key}-${new Date().toISOString().slice(0, 10)}` };
      if (format === 'csv') downloadCSV(dataset);
      else downloadXLSX(dataset);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setBusyExport(undefined);
    }
  }

  async function handleBuildPackage() {
    if (!company) return;
    setPkgBusy(true);
    setError(undefined);
    try {
      const built = await buildMigrationPackage(company.id, company.name);
      setPkg(built);
      downloadMigrationPackage(built);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build the migration package.');
    } finally {
      setPkgBusy(false);
    }
  }

  async function handlePackageUpload(file: File) {
    setError(undefined);
    const { result, pkg: validPkg } = await validateMigrationPackageFile(file);
    setValidated({ manifest: result.manifest!, pkg: validPkg, errors: result.errors });
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Data Export"
        description="Export accounting data as CSV/Excel, download blank import templates, or build/re-import a structured Vertex migration package."
        actions={
          <>
            <HelpLink article="data-export" className="mr-1" />
            <Button variant="outline" size="sm" render={<Link to="/admin/imports" />}>
              Back to overview
            </Button>
          </>
        }
      />

      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <SectionCard title="Export Data" description="Every export below is labelled Migration-Compatible: stable column headers, typed values, no presentation-only formatting — safe to re-import through the matching Import Centre adapter.">
        <div className="flex flex-col divide-y divide-border/50">
          {quickExports.map((item) => (
            <div key={item.key} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <span className="flex items-center gap-2 text-sm font-medium">
                {item.label}
                {item.migrationCompatible && <span className="rounded-full bg-status-positive-muted px-2 py-0.5 text-[0.6875rem] font-medium text-status-positive">Migration-Compatible</span>}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={busyExport === item.key} onClick={() => void handleExport(item, 'csv')}>
                  {busyExport === item.key ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Download className="size-3.5" aria-hidden="true" />} CSV
                </Button>
                <Button variant="outline" size="sm" disabled={busyExport === item.key} onClick={() => void handleExport(item, 'xlsx')}>
                  Excel
                </Button>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Downloadable Templates" description="Blank column headers only — no sample company data.">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {IMPORT_TEMPLATES.map((t) => (
            <Button key={t.id} variant="outline" size="sm" className="justify-start" onClick={() => downloadTemplateCSV(t)}>
              <Download className="mr-2 size-3.5" aria-hidden="true" /> {t.label} template
            </Button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Vertex Migration Package" description="A single JSON file — a manifest plus typed CSV sections, each with its own integrity hash — for backup, archival, or moving data between Vertex environments. Not a ZIP/archive file; every section is stored as CSV text inside one JSON document, keeping it human-inspectable and dependency-free. Never a raw database dump, never secrets/tokens.">
        <div className="flex flex-col gap-4">
          <Button variant="outline" size="sm" disabled={pkgBusy || !company} onClick={() => void handleBuildPackage()} className="w-fit">
            {pkgBusy ? <Loader2 className="mr-2 size-3.5 animate-spin" aria-hidden="true" /> : <FileJson className="mr-2 size-3.5" aria-hidden="true" />}
            Build & download Vertex Migration Package (.json)
          </Button>
          {pkg && (
            <ul className="text-xs text-muted-foreground">
              {pkg.manifest.sections.map((s) => (
                <li key={s.key}>
                  {s.label}: {s.recordCount} record(s)
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-border pt-4">
            <label className="flex h-9 w-fit cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-4 text-sm font-medium text-brand hover:underline">
              <Upload className="size-4" aria-hidden="true" />
              Upload a migration package to validate & re-import
              <input
                type="file"
                accept=".json,application/json"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handlePackageUpload(file);
                  e.target.value = '';
                }}
              />
            </label>
            {validated && (
              <div className="mt-3 flex flex-col gap-2">
                {validated.errors.length > 0 ? (
                  <ul className="list-disc space-y-1 pl-5 text-sm text-status-negative">
                    {validated.errors.map((e) => <li key={e}>{e}</li>)}
                  </ul>
                ) : (
                  <>
                    <p className="text-sm text-status-positive">Package valid — schema version {validated.manifest.schemaVersion}, generated {new Date(validated.manifest.generatedAt).toLocaleDateString('en-ZA')}.</p>
                    <div className="flex flex-wrap gap-2">
                      {validated.manifest.sections.map((s) => (
                        <Button
                          key={s.key}
                          variant="outline"
                          size="sm"
                          disabled={!SECTION_ADAPTERS[s.key]}
                          onClick={() => validated.pkg && setReimportKey({ sectionKey: s.key, file: extractSectionAsFile(validated.pkg, s.key) })}
                        >
                          Import {s.label} ({s.recordCount})
                        </Button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {reimportKey && SECTION_ADAPTERS[reimportKey.sectionKey] && (
        <ImportWizard
          adapters={[SECTION_ADAPTERS[reimportKey.sectionKey]]}
          initialFile={reimportKey.file}
          batch={{ importType: reimportKey.sectionKey, sourceSystem: 'vertex_package' }}
          onClose={() => setReimportKey(undefined)}
          onImported={() => setReimportKey(undefined)}
        />
      )}
    </div>
  );
}
