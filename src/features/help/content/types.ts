/**
 * Help Centre content model (Administration module, Block F). Every article
 * describes REAL, implemented Vertex behaviour — no roadmap features, no
 * fabricated screenshots, no chatbot. Bodies are plain structured text
 * rendered by the Help pages, not markdown.
 */

export type HelpCategory =
  | 'Getting started'
  | 'Sales'
  | 'Purchasing'
  | 'Banking'
  | 'Inventory'
  | 'Accounting'
  | 'Tax & compliance'
  | 'Fixed assets'
  | 'Payroll'
  | 'Reporting'
  | 'Administration'
  | 'Security & privacy'
  | 'Troubleshooting';

export interface HelpSection {
  heading: string;
  /** A paragraph, or a list of bullet points. */
  body: string | string[];
}

export interface HelpArticle {
  /** URL slug — stable, used in `/help/:id`. */
  id: string;
  title: string;
  category: HelpCategory;
  /** One–two sentences shown in search results and on category pages. */
  summary: string;
  /** Extra search terms not already in the title/summary/body. */
  keywords: string[];
  /** Deep link into the feature the article is about, when there is one. */
  route?: string;
  /** Permissions/roles needed to use the feature (free text — shown verbatim). */
  permissions?: string;
  /** GL / ledger effect, when the feature posts accounting. */
  accountingImpact?: string;
  sections: HelpSection[];
  /** `id`s of related articles. */
  related?: string[];
}
