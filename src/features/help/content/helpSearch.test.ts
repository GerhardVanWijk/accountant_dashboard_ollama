import { describe, expect, it } from 'vitest';
import { HELP_ARTICLES, HELP_CATEGORY_ORDER, getArticle, relatedArticles, searchHelp } from './index';

describe('Help Centre content', () => {
  it('every article has the required shape', () => {
    for (const a of HELP_ARTICLES) {
      expect(a.id).toMatch(/^[a-z0-9-]+$/);
      expect(a.title.length).toBeGreaterThanOrEqual(3);
      expect(a.summary.length).toBeGreaterThan(10);
      expect(a.sections.length).toBeGreaterThan(0);
      expect(HELP_CATEGORY_ORDER).toContain(a.category);
    }
  });

  it('has no duplicate ids', () => {
    const ids = HELP_ARTICLES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every `related` id and `route` resolves', () => {
    for (const a of HELP_ARTICLES) {
      for (const rel of a.related ?? []) {
        expect(getArticle(rel), `${a.id} -> ${rel}`).toBeDefined();
      }
      if (a.route) expect(a.route.startsWith('/')).toBe(true);
    }
  });

  it('covers every product area the brief lists', () => {
    const haystack = HELP_ARTICLES.map((a) =>
      `${a.title} ${a.summary} ${a.keywords.join(' ')} ${a.category}`.toLowerCase(),
    ).join(' | ');
    for (const topic of [
      'getting started', 'dashboard', 'customers', 'suppliers', 'invoice', 'purchasing', 'banking',
      'reconcil', 'inventory', 'general ledger', 'journal', 'vat', 'income tax', 'fixed asset',
      'payroll', 'forecast', 'users and roles', 'audit trail', 'access log', 'document',
      'notification', 'accounting settings', 'plan and billing', 'troubleshooting', 'security',
    ]) {
      expect(haystack, topic).toContain(topic);
    }
  });

  it('has a troubleshooting article for every required case', () => {
    for (const id of [
      'ts-cannot-create-company', 'ts-cannot-add-user', 'ts-invitation-expired',
      'ts-cannot-access-module', 'ts-module-locked', 'ts-company-suspended',
      'ts-invoice-wont-post', 'ts-journal-wont-post', 'ts-bank-wont-reconcile',
      'ts-inventory-quantity-wrong', 'ts-vat-differs', 'ts-period-locked',
      'ts-document-upload-failed', 'ts-notification-wont-clear',
    ]) {
      expect(getArticle(id), id).toBeDefined();
    }
  });
});

describe('searchHelp — ranking', () => {
  it('returns nothing for an empty query', () => {
    expect(searchHelp('')).toEqual([]);
    expect(searchHelp('   ')).toEqual([]);
  });

  it('a symptom phrase surfaces its troubleshooting article first', () => {
    expect(searchHelp("invoice won't post")[0].article.id).toBe('ts-invoice-wont-post');
    expect(searchHelp('bank will not reconcile')[0].article.id).toBe('ts-bank-wont-reconcile');
    expect(searchHelp('why is a module locked')[0].article.id).toBe('ts-module-locked');
  });

  it('a feature name surfaces its main article above passing mentions', () => {
    const vat = searchHelp('vat');
    expect(vat[0].article.id).toBe('vat');
    const rec = searchHelp('reconciliation');
    expect(rec[0].article.id).toBe('bank-reconciliation');
  });

  it('a keyword-only term still matches', () => {
    expect(searchHelp('debtors').some((h) => h.article.id === 'customers')).toBe(true);
    expect(searchHelp('popia').some((h) => h.article.id === 'security-privacy')).toBe(true);
  });

  it('requires every term to be present somewhere', () => {
    expect(searchHelp('invoice zzzznotareal').length).toBe(0);
  });

  it('relatedArticles resolves ids to articles', () => {
    const notifications = getArticle('notifications')!;
    const related = relatedArticles(notifications);
    expect(related.length).toBeGreaterThan(0);
    expect(related.every((r) => typeof r.title === 'string')).toBe(true);
  });
});
