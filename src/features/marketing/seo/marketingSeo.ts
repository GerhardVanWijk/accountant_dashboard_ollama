import { SITE_NAME, SITE_URL } from '@/lib/seo/Seo';

/**
 * Per-page SEO for the PUBLIC marketing site only. Titles and descriptions
 * are written from what the real app does (each `/product/*` page's copy is
 * already verified against `src/features/*` — see the page components and
 * `content.ts`), not marketing embellishment. Anything not listed here is
 * treated as a private/app route and rendered `noindex` — see
 * `MarketingSeo` and `public/_headers`.
 */

export interface MarketingSeoEntry {
  path: string;
  title: string;
  description: string;
  /** Label for the BreadcrumbList second crumb (sub-pages only). */
  breadcrumb?: string;
}

export const MARKETING_SEO: MarketingSeoEntry[] = [
  {
    path: '/',
    title: 'Cloud accounting for South African business',
    description:
      'Invoice in rands, import and reconcile your bank statements, prepare your VAT201 from posted transactions, and run SARS-table payroll — cloud accounting built for South African compliance.',
  },
  {
    path: '/demo',
    title: 'See the live demo',
    description: 'Explore a worked set of books in Vertex Accounting — invoicing, bank reconciliation, VAT and financial statements.',
    breadcrumb: 'Live demo',
  },
  {
    path: '/product/invoicing',
    title: 'Invoicing & quotes',
    description:
      'Branded quotes that convert to a tax invoice in one click, with credit notes, customer receipts and customer deposits — all in rands, with 15% VAT handled for you.',
    breadcrumb: 'Invoicing',
  },
  {
    path: '/product/banking',
    title: 'Bank import & reconciliation',
    description:
      'Import statements in CSV, OFX/QFX, QIF or SWIFT MT940, review scored match suggestions, split allocations across accounts and VAT codes, and finalise a zero-variance reconciliation.',
    breadcrumb: 'Banking',
  },
  {
    path: '/product/tax',
    title: 'VAT & tax',
    description:
      'Your VAT201 is built continuously from transactions you have already posted. Income tax, provisional tax, CGT, dividends tax and deferred tax computations included.',
    breadcrumb: 'Tax',
  },
  {
    path: '/product/expenses',
    title: 'Bills & expenses',
    description:
      'Capture supplier bills and expenses coded as you go, track what you owe with vendor aging, and record supplier payments against a real accounts-payable ledger.',
    breadcrumb: 'Expenses',
  },
  {
    path: '/product/payroll',
    title: 'Payroll',
    description:
      'Run payroll on verified SARS tax tables — PAYE, UIF and SDL calculated for the current tax year, with EMP201 and EMP501 workflows.',
    breadcrumb: 'Payroll',
  },
  {
    path: '/product/reporting',
    title: 'Financial reporting & forecasting',
    description:
      'Income Statement, Balance Sheet and Cash Flow on IFRS-for-SMEs lines, customer and supplier aging, and budget-vs-forecast-vs-actual with evidence-backed variance analysis.',
    breadcrumb: 'Reporting',
  },
  {
    path: '/company/about',
    title: 'About Vertex Accounting',
    description: 'Cloud accounting software built specifically for South African compliance, VAT, payroll and financial reporting.',
    breadcrumb: 'About',
  },
  {
    path: '/company/contact',
    title: 'Contact us',
    description: 'Get in touch with the Vertex Accounting team about the product, your account, billing or support for South African cloud accounting.',
    breadcrumb: 'Contact',
  },
  {
    path: '/resources/help',
    title: 'Help centre',
    description: 'Guides for getting started with Vertex Accounting — company setup, invoicing, bank reconciliation, VAT and payroll.',
    breadcrumb: 'Help centre',
  },
  {
    path: '/resources/vat-guide',
    title: 'South African VAT guide',
    description: 'How VAT works for South African businesses: registration, the 15% standard rate, input vs output VAT, and preparing your VAT201.',
    breadcrumb: 'VAT guide',
  },
  {
    path: '/legal/privacy',
    title: 'Privacy policy',
    description: 'How Vertex Accounting collects, uses, stores and protects your personal and business information, and the choices you have over it.',
    breadcrumb: 'Privacy policy',
  },
  {
    path: '/legal/popia',
    title: 'POPIA statement',
    description: 'How Vertex Accounting complies with the Protection of Personal Information Act (POPIA) as a responsible party and operator for South African businesses.',
    breadcrumb: 'POPIA statement',
  },
  {
    path: '/legal/terms',
    title: 'Terms of service',
    description: 'The terms that govern your use of Vertex Accounting — your account, acceptable use, data ownership, availability and liability.',
    breadcrumb: 'Terms of service',
  },
  {
    path: '/legal/security',
    title: 'Security',
    description: 'How Vertex Accounting protects your accounting data — hosting, access control, encryption and the audit trail.',
    breadcrumb: 'Security',
  },
];

export const MARKETING_SEO_BY_PATH = new Map(MARKETING_SEO.map((e) => [e.path, e]));

/** Every public canonical URL — the only URLs that belong in the sitemap. */
export const PUBLIC_CANONICAL_PATHS = MARKETING_SEO.map((e) => e.path);

/**
 * Site-wide Schema.org graph, emitted once on the homepage. Truthful only —
 * no ratings, reviews, awards, prices or customer counts (there is no live
 * billing and no public customer list to cite).
 */
export const HOME_STRUCTURED_DATA: Record<string, unknown>[] = [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    legalName: 'Vertex Accounting Solutions',
    url: `${SITE_URL}/`,
    description:
      'Cloud accounting software built for South African compliance — invoicing, bank reconciliation, VAT201, SARS-table payroll and IFRS-for-SMEs financial statements.',
    areaServed: { '@type': 'Country', name: 'South Africa' },
    knowsAbout: [
      'South African accounting software',
      'VAT201',
      'bank reconciliation',
      'PAYE UIF SDL payroll',
      'IFRS for SMEs financial statements',
      'inventory accounting',
    ],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: `${SITE_URL}/`,
  },
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Accounting',
    operatingSystem: 'Web',
    description:
      'Accounting software for South African businesses: invoicing in rands, bank statement import and reconciliation, VAT201, income and provisional tax, fixed assets, inventory, SARS-table payroll, and financial reporting.',
    url: `${SITE_URL}/`,
  },
];

export function breadcrumbStructuredData(entry: MarketingSeoEntry): Record<string, unknown> | null {
  if (!entry.breadcrumb) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: entry.breadcrumb, item: `${SITE_URL}${entry.path}` },
    ],
  };
}
