import { describe, expect, it } from 'vitest';
import { getArticle, searchHelp } from './index';

/** The Data Import & Migration Centre Help articles (2026-09-08). */
const IDS = [
  'data-migration',
  'import-preparing-file',
  'import-csv',
  'import-excel',
  'import-mapping-profiles',
  'import-validation',
  'import-exceptions',
  'import-history',
  'import-evidence-documents',
  'data-export',
  'import-duplicate-files',
  'import-no-fuzzy-mapping',
  'import-accounting-unavailable',
  'import-bank-vs-migration',
  'import-security-isolation',
];

describe('Data migration Help articles', () => {
  it('every requested article exists, under Administration, with a route where it has a page', () => {
    for (const id of IDS) {
      const a = getArticle(id);
      expect(a, id).toBeDefined();
      expect(a!.category).toBe('Administration');
    }
    expect(getArticle('data-migration')!.route).toBe('/admin/imports');
    expect(getArticle('data-export')!.route).toBe('/admin/exports');
    expect(getArticle('import-exceptions')!.route).toBe('/admin/imports/exceptions');
  });

  it('does not claim a native connector for Pastel / Sage / Xero / Syspro', () => {
    const text = IDS.map((id) => JSON.stringify(getArticle(id))).join(' ').toLowerCase();
    expect(text).not.toMatch(/connect to (pastel|sage|xero|syspro)/);
    expect(text).not.toMatch(/live (pastel|sage|xero|syspro) (feed|api|integration)/);
    // and it does say you upload an export file
    expect(getArticle('data-migration')!.sections.some((s) =>
      (Array.isArray(s.body) ? s.body.join(' ') : s.body).toLowerCase().includes('export'),
    )).toBe(true);
  });

  it('explains why the accounting-event imports are unavailable', () => {
    const a = getArticle('import-accounting-unavailable')!;
    const body = a.sections.map((s) => (Array.isArray(s.body) ? s.body.join(' ') : s.body)).join(' ').toLowerCase();
    expect(body).toMatch(/draft/);
    expect(body).toMatch(/trial balance/);
  });

  it('search surfaces the right article for common phrases', () => {
    expect(searchHelp('data migration')[0].article.id).toBe('data-migration');
    expect(searchHelp('import mapping profile')[0].article.id).toBe('import-mapping-profiles');
    expect(searchHelp('fuzzy matching').some((h) => h.article.id === 'import-no-fuzzy-mapping')).toBe(true);
    expect(searchHelp('trial balance import').some((h) => h.article.id === 'import-accounting-unavailable')).toBe(true);
  });
});
