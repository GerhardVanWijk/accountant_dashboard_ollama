import { HELP_ARTICLES } from './articles';
import type { HelpArticle, HelpCategory } from './types';

export type { HelpArticle, HelpCategory, HelpSection } from './types';
export { HELP_ARTICLES } from './articles';

export const HELP_CATEGORY_ORDER: HelpCategory[] = [
  'Getting started',
  'Sales',
  'Purchasing',
  'Banking',
  'Inventory',
  'Accounting',
  'Tax & compliance',
  'Fixed assets',
  'Payroll',
  'Reporting',
  'Administration',
  'Security & privacy',
  'Troubleshooting',
];

const BY_ID = new Map(HELP_ARTICLES.map((a) => [a.id, a]));

export function getArticle(id: string): HelpArticle | undefined {
  return BY_ID.get(id);
}

export function articlesByCategory(category: HelpCategory): HelpArticle[] {
  return HELP_ARTICLES.filter((a) => a.category === category);
}

export function relatedArticles(article: HelpArticle): HelpArticle[] {
  return (article.related ?? []).map((id) => BY_ID.get(id)).filter((a): a is HelpArticle => Boolean(a));
}

export interface HelpSearchHit {
  article: HelpArticle;
  score: number;
  /** A short snippet of the first matching body text, for the result list. */
  snippet?: string;
}

function bodyText(article: HelpArticle): string {
  return article.sections
    .map((s) => `${s.heading} ${Array.isArray(s.body) ? s.body.join(' ') : s.body}`)
    .join(' ');
}

/**
 * Ranked full-text search over title, summary, keywords and body. An exact
 * title match or a title-word hit ranks far above a body-only hit, so
 * "invoice won't post" surfaces the troubleshooting article, not every
 * article that mentions invoices.
 */
export function searchHelp(query: string): HelpSearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);

  const hits: HelpSearchHit[] = [];
  for (const article of HELP_ARTICLES) {
    const title = article.title.toLowerCase();
    const summary = article.summary.toLowerCase();
    const keywords = article.keywords.map((k) => k.toLowerCase());
    const body = bodyText(article).toLowerCase();

    let score = 0;
    if (title === q) score += 1000;
    if (title.includes(q)) score += 200;
    if (keywords.some((k) => k === q)) score += 150;
    if (summary.includes(q)) score += 60;

    for (const term of terms) {
      if (title.includes(term)) score += 40;
      if (keywords.some((k) => k.includes(term))) score += 25;
      if (summary.includes(term)) score += 12;
      if (body.includes(term)) score += 4;
    }
    // every term must appear somewhere, or it is not a hit
    const everyTermPresent = terms.every(
      (t) => title.includes(t) || summary.includes(t) || body.includes(t) || keywords.some((k) => k.includes(t)),
    );
    if (score > 0 && everyTermPresent) {
      const firstMatch = article.sections.find((s) => {
        const text = (Array.isArray(s.body) ? s.body.join(' ') : s.body).toLowerCase();
        return terms.some((t) => text.includes(t));
      });
      const snippetSource = firstMatch
        ? Array.isArray(firstMatch.body)
          ? firstMatch.body.join(' ')
          : firstMatch.body
        : article.summary;
      hits.push({
        article,
        score,
        snippet: snippetSource.length > 180 ? `${snippetSource.slice(0, 177)}…` : snippetSource,
      });
    }
  }

  return hits.sort((a, b) => b.score - a.score || a.article.title.localeCompare(b.article.title));
}
