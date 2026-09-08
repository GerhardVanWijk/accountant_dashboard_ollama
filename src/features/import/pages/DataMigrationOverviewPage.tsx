import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, FileSpreadsheet, FileText, Landmark, Package, Receipt } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import { StatusBadge } from '@/components/app/status-badge';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { ImportWizard } from '../components/ImportWizard';
import {
  chartOfAccountsImportAdapter,
  customerImportAdapter,
  supplierImportAdapter,
  productImportAdapter,
  openingStockImportAdapter,
} from '../adapters';
import type { ImportAdapter } from '../types';
import type { SourceSystem } from '../migration/types';
import { SOURCE_SYSTEM_PROFILES } from '../migration/sourceSystemProfiles';
import { listBankStatementSummaries, type BankStatementSummary } from '../migration/bankStatementSummary';

interface ImportCard {
  key: string;
  label: string;
  description: string;
  category: 'MASTER DATA' | 'OPENING BALANCES' | 'ACCOUNTING';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapter: ImportAdapter<any, any>;
}
const IMPORT_CARDS: ImportCard[] = [
  { key: 'chart_of_accounts', label: 'Chart of Accounts', description: 'Account codes, names, types and hierarchy.', category: 'ACCOUNTING', adapter: chartOfAccountsImportAdapter },
  { key: 'customers', label: 'Customer Master', description: 'Customer directory — code, contact, terms.', category: 'MASTER DATA', adapter: customerImportAdapter },
  { key: 'suppliers', label: 'Supplier Master', description: 'Supplier directory — code, contact, terms.', category: 'MASTER DATA', adapter: supplierImportAdapter },
  { key: 'products', label: 'Inventory / Stock Master', description: 'Products — SKU, pricing, category.', category: 'MASTER DATA', adapter: productImportAdapter },
  { key: 'opening_stock', label: 'Opening Stock', description: 'Opening inventory quantities and cost, as a draft batch.', category: 'OPENING BALANCES', adapter: openingStockImportAdapter },
];

/**
 * Opening-balance imports that need to create a *draft* manual journal
 * (Trial Balance, General Ledger detail, AR & AP opening balances) are not
 * available yet — Vertex has no manual-journal-draft lifecycle for the
 * wizard to post into. Shown here honestly rather than hidden.
 */
const DEFERRED_IMPORTS = [
  'Trial Balance',
  'General Ledger detail',
  'AR opening balances',
  'AP opening balances',
];

function ImportTypeButton({ card, onOpen }: { card: ImportCard; onOpen: (card: ImportCard) => void }) {
  const allowed = useCanAccess(card.adapter.permission.feature, card.adapter.permission.action);
  if (!allowed) return null;
  return (
    <button
      type="button"
      onClick={() => onOpen(card)}
      className="flex flex-col gap-1 rounded-lg border border-border p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
    >
      <span className="text-sm font-medium text-foreground">{card.label}</span>
      <span className="text-xs text-muted-foreground">{card.description}</span>
    </button>
  );
}

function CategorySection({ title, cards, onOpen }: { title: string; cards: ImportCard[]; onOpen: (card: ImportCard) => void }) {
  return (
    <SectionCard title={title}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <ImportTypeButton key={card.key} card={card} onOpen={onOpen} />
        ))}
      </div>
    </SectionCard>
  );
}

export function DataMigrationOverviewPage() {
  const [activeCard, setActiveCard] = useState<ImportCard | undefined>(undefined);
  const [sourceSystem, setSourceSystem] = useState<SourceSystem>('generic');
  const [statements, setStatements] = useState<BankStatementSummary[]>([]);

  useEffect(() => {
    listBankStatementSummaries().then(setStatements).catch(() => setStatements([]));
  }, []);

  const activeProfile = SOURCE_SYSTEM_PROFILES.find((p) => p.id === sourceSystem);
  const masterData = IMPORT_CARDS.filter((c) => c.category === 'MASTER DATA');
  const openingBalances = IMPORT_CARDS.filter((c) => c.category === 'OPENING BALANCES');
  const accounting = IMPORT_CARDS.filter((c) => c.category === 'ACCOUNTING');

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Data Import & Migration"
        description="Migrate accounting data from another system, or your own Vertex exports, into this company — with mapping, validation and reconciliation before anything is confirmed."
        actions={
          <>
            <Button variant="outline" size="sm" render={<Link to="/admin/imports/history" />}>
              Import History
            </Button>
            <Button variant="outline" size="sm" render={<Link to="/admin/exports" />}>
              Export Data
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QuickLink to="/admin/imports/mappings" icon={FileSpreadsheet} label="Mapping Profiles" hint="Saved column/account mappings" />
        <QuickLink to="/admin/imports/exceptions" icon={FileText} label="Exceptions" hint="Unresolved issues across every batch" />
        <QuickLink to="/admin/imports/documents" icon={Receipt} label="Documents & Evidence" hint="Supporting files — never posts accounting" />
        <QuickLink to="/admin/exports" icon={Package} label="Migration Packages" hint="Export or re-import a structured package" />
      </div>

      <SectionCard title="Source system" description="Every import goes through the same mapping/validation/preview pipeline regardless of source — this only labels the batch and, for a known system, shows its real limitations up front.">
        <div className="flex flex-wrap gap-2">
          {SOURCE_SYSTEM_PROFILES.filter((p) => p.id !== 'vertex_package').map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSourceSystem(p.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${sourceSystem === p.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {sourceSystem !== 'generic' && activeProfile && (
          <div className="mt-3 flex flex-col gap-2 rounded-lg border border-status-warning-outline bg-status-warning-surface px-3 py-2.5">
            <p className="flex items-center gap-2 text-sm font-medium text-status-warning">
              <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
              {activeProfile.label}: "{activeProfile.description}"
            </p>
            <p className="text-xs text-muted-foreground">This is generic, source-assisted migration — not native {activeProfile.label} format support. Every file below still goes through the standard mapping/validation/preview pipeline.</p>
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              {activeProfile.knownLimitations.map((l) => <li key={l}>{l}</li>)}
            </ul>
          </div>
        )}
      </SectionCard>

      <CategorySection title="Accounting Data" cards={accounting} onOpen={setActiveCard} />
      <CategorySection title="Customers & Suppliers / Inventory (Master Data)" cards={masterData} onOpen={setActiveCard} />
      <CategorySection title="Opening Balances" cards={openingBalances} onOpen={setActiveCard} />

      <SectionCard title="Not available yet" description="These imports create a draft journal for review before posting — a capability Vertex does not have yet. They will be enabled once the manual-journal-draft lifecycle ships.">
        <ul className="flex flex-wrap gap-2">
          {DEFERRED_IMPORTS.map((label) => (
            <li key={label} className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
              {label}
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Banking" description="Bank statement import already has its own dedicated, mature workflow — reused here rather than rebuilt.">
        <div className="flex flex-col gap-4">
          <Button variant="outline" size="sm" render={<Link to="/banking" />} className="w-fit">
            Go to Banking import <ArrowRight className="ml-1 size-3.5" aria-hidden="true" />
          </Button>
          {statements.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    <th className="px-3 py-2">File</th>
                    <th className="px-3 py-2">Opening</th>
                    <th className="px-3 py-2">Closing</th>
                    <th className="px-3 py-2">Lines</th>
                    <th className="px-3 py-2">Balance check</th>
                    <th className="px-3 py-2">Reconciliation</th>
                  </tr>
                </thead>
                <tbody>
                  {statements.slice(0, 10).map((s) => (
                    <tr key={s.id} className="border-b border-border/50 last:border-0">
                      <td className="px-3 py-2">{s.sourceFilename ?? '—'}</td>
                      <td className="px-3 py-2 tabular-nums">R {s.openingBalance.toFixed(2)}</td>
                      <td className="px-3 py-2 tabular-nums">R {s.closingBalance.toFixed(2)}</td>
                      <td className="px-3 py-2 tabular-nums">{s.lineCount}</td>
                      <td className="px-3 py-2">
                        {s.balanceCheckOk === undefined ? <span className="text-muted-foreground">—</span> : <StatusBadge status={s.balanceCheckOk ? 'reconciled' : 'unreconciled'} />}
                      </td>
                      <td className="px-3 py-2"><StatusBadge status={s.reconciliationStatus} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SectionCard>

      {activeCard && (
        <ImportWizard
          adapters={[activeCard.adapter]}
          batch={{ importType: activeCard.key, sourceSystem }}
          onClose={() => setActiveCard(undefined)}
          onImported={() => setActiveCard(undefined)}
        />
      )}
    </div>
  );
}

function QuickLink({ to, icon: Icon, label, hint }: { to: string; icon: typeof Landmark; label: string; hint: string }) {
  return (
    <Link to={to} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_rgb(7_20_40_/_4%)] transition-colors hover:border-primary/40">
      <Icon className="size-5 text-primary" aria-hidden="true" />
      <span className="text-sm font-medium text-foreground">{label}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </Link>
  );
}
