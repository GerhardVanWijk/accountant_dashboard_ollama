import { describe, expect, it } from 'vitest';
import { HELP_ARTICLES } from './index';

/**
 * The customer Help Centre must never cite internal engineering artefacts —
 * the master spec, migration numbers, phase names, or repository/RPC/RLS
 * jargon. Those belong in code comments, tests and docs/, not in the
 * prose an ordinary user reads. Keywords are excluded: they are invisible
 * search aliases, not rendered copy.
 */
const FORBIDDEN: { label: string; pattern: RegExp }[] = [
  { label: 'master spec filename', pattern: /SA_ACCOUNTING_MASTER_SPEC/i },
  { label: 'a docs/*.md citation', pattern: /docs\/[A-Z0-9_]+\.md/ },
  { label: 'a spec section sign', pattern: /§\s*\d/ },
  { label: 'a migration number', pattern: /\bmigration\s+\d{2,}/i },
  { label: 'an internal phase name', pattern: /\bPhase\s+\d+[A-Z]?\b/ },
  { label: 'raw persistence jargon', pattern: /\bJSONB\b|\bthe RPC\b|\bdual-write\b|\bprojection table\b/i },
];

function visibleText(article: (typeof HELP_ARTICLES)[number]): string {
  const parts = [article.title, article.summary, article.permissions ?? '', article.accountingImpact ?? ''];
  for (const section of article.sections) {
    parts.push(section.heading);
    parts.push(Array.isArray(section.body) ? section.body.join(' ') : section.body);
  }
  return parts.join('\n');
}

describe('Help Centre — no internal engineering references in rendered copy', () => {
  for (const article of HELP_ARTICLES) {
    it(`"${article.id}" reads as customer-facing copy`, () => {
      const text = visibleText(article);
      for (const { label, pattern } of FORBIDDEN) {
        expect(pattern.test(text), `${article.id} contains ${label}`).toBe(false);
      }
    });
  }
});
