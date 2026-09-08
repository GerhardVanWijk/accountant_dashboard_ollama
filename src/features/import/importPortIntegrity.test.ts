import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrationImportAdapters } from './adapters';
import { SOURCE_SYSTEM_PROFILES } from './migration/sourceSystemProfiles';
import { IMPORT_TEMPLATES } from './migration/templates';
import { routePermissions } from '@/features/auth/permissionRouteMap';
import { navGroups } from '@/lib/app/navigation';

const PAGES_DIR = join(process.cwd(), 'src/features/import/pages');
const pageFiles = readdirSync(PAGES_DIR).filter((f) => f.endsWith('.tsx'));

describe('SLC import/export port — Vertex integration', () => {
  it('carries no Sovereign / SLC branding in any import page or the wizard', () => {
    const files = [
      ...pageFiles.map((f) => join(PAGES_DIR, f)),
      join(process.cwd(), 'src/features/import/components/ImportWizard.tsx'),
      join(process.cwd(), 'src/features/import/migration/sourceSystemProfiles.ts'),
      join(process.cwd(), 'src/features/import/migration/migrationPackage.ts'),
    ];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/\bSLC\b/);
      expect(text, file).not.toMatch(/sovereign/i);
      expect(text, file).not.toMatch(/slc_package/);
    }
  });

  it('offers only the import types that work against Vertex today', () => {
    expect(migrationImportAdapters.map((a) => a.id).sort()).toEqual(
      ['chart_of_accounts', 'customers', 'inventory-opening-stock', 'inventory-products', 'suppliers'].sort(),
    );
    // the deferred accounting-event adapters must NOT be registered
    for (const deferred of ['trial_balance', 'gl_detail', 'ar_opening', 'ap_opening']) {
      expect(migrationImportAdapters.some((a) => a.id === deferred)).toBe(false);
    }
  });

  it('Chart of Accounts gates on data_migration:import; the shared master-data adapters keep their own domain gate', () => {
    const coa = migrationImportAdapters.find((a) => a.id === 'chart_of_accounts')!;
    expect(coa.permission).toEqual({ feature: 'data_migration', action: 'import' });
    // customers/suppliers/products/opening-stock are the SAME instances used by
    // the embedded "Import" buttons on those pages — they keep their existing
    // domain permission, not data_migration (see docs/KNOWN_ISSUES.md).
    for (const a of migrationImportAdapters) {
      expect(a.permission.action).toBe('import');
      expect(typeof a.permission.feature).toBe('string');
    }
  });

  it('the DataMigrationOverviewPage names the deferred imports honestly', () => {
    const overview = readFileSync(join(PAGES_DIR, 'DataMigrationOverviewPage.tsx'), 'utf8');
    expect(overview).toMatch(/Not available yet/);
    for (const label of ['Trial Balance', 'General Ledger detail', 'AR opening balances', 'AP opening balances']) {
      expect(overview).toContain(label);
    }
  });

  it('keeps the honest source-system state — external systems are file-import labels, not connectors', () => {
    for (const p of SOURCE_SYSTEM_PROFILES) {
      if (p.id === 'generic' || p.id === 'vertex_package') continue;
      const blob = `${p.description} ${p.knownLimitations.join(' ')}`.toLowerCase();
      // it must describe a file upload, never a "connect to X" action
      expect(blob, p.id).toMatch(/upload a csv or excel file|exported from/);
      expect(blob, p.id).not.toMatch(/\bconnect to (pastel|sage|xero|syspro)\b/);
    }
    expect(SOURCE_SYSTEM_PROFILES.some((p) => p.id === 'vertex_package')).toBe(true);
  });

  it('templates only cover working import types', () => {
    expect(IMPORT_TEMPLATES.map((t) => t.id).sort()).toEqual(
      ['chart_of_accounts', 'customers', 'products', 'suppliers'].sort(),
    );
  });

  it('routes and nav are wired', () => {
    expect(routePermissions['/admin/imports']).toEqual({ feature: 'data_migration', action: 'read' });
    expect(routePermissions['/admin/exports']).toEqual({ feature: 'data_migration', action: 'read' });
    const admin = navGroups.find((g) => g.title === 'Administration');
    expect(admin?.items.some((i) => i.href === '/admin/imports')).toBe(true);
    expect(admin?.items.some((i) => i.href === '/admin/exports')).toBe(true);
  });
});
