/**
 * Marketing copy/data for the public homepage, ported verbatim from
 * accounting-v0-frontend/lib/landing-content.ts (M6:
 * docs/SUPABASE_MIGRATION_GUIDE.md's sibling UI-port initiative — the v0
 * project is source of truth for this page's design/layout only; content
 * accuracy is governed separately, see below).
 *
 * CONTENT INTEGRITY PASS (public-website-truth-audit): every string in this
 * file was checked against the real Supabase-backed app — its services,
 * repositories and routes — not assumed from v0's original marketing copy.
 * v0's template shipped with fictional integrations (live bank feeds,
 * SARS eFiling submission, OCR slip capture), fabricated usage stats and
 * named testimonials, and a fully mocked pricing/billing model (no
 * payment gateway, no trial enforcement, no plan limits exist anywhere in
 * this codebase — `Company.subscriptionTier` is an unenforced free-text
 * field). All of that has been reworded or removed here. `brand.ctaPrimary`
 * is now a read-only live-demo CTA, not a signup/trial CTA — there is no
 * real subscription/billing system for a "free trial" to attach to.
 * `demoHref` points at the new `/demo` interim page (no auth/data
 * architecture changes were made — that's a separate, not-yet-approved
 * piece of work). `signInHref`/`signUpHref` are this app's real /login and
 * /signup routes, unchanged.
 */

export const brand = {
  name: 'Vertex',
  fullName: 'Vertex Accounting Solutions',
  tagline: 'Cloud accounting built for South African business',
  ctaPrimary: 'View live demo',
  ctaSecondary: 'Sign in',
  signInHref: '/login',
  signUpHref: '/signup',
  demoHref: '/demo',
} as const;

export const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'Product', href: '#product' },
  { label: 'Why switch', href: '#compare' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
] as const;

export const hero = {
  eyebrow: 'VAT201 prepared straight from your books',
  headline: 'Accounting that speaks',
  headlineAccent: 'South African',
  headlineEnd: 'business.',
  subhead:
    'Invoice in rands, import and reconcile your bank statements, and prepare your VAT201 from transactions you have already posted — built for South African businesses that want their books in one place.',
  trustLine: ['15% VAT ready', 'SA payroll built in', 'Full audit trail', 'Double-entry accounting'],
} as const;

/** Real, verifiable statement formats the banking module parses (src/features/banking/utils/statementParsers.ts) — not a claim of live bank-API integration, which does not exist. */
export const integrations = ['CSV', 'OFX', 'QFX', 'QIF', 'SWIFT MT940'] as const;

/** Real product facts, not usage/growth metrics — this product has no live customers or usage data to report yet. */
export const stats = [
  { value: '15%', label: 'VAT calculated automatically at the standard rate' },
  { value: 'Double-entry', label: 'Every transaction posts a real, balanced ledger entry' },
  { value: 'PAYE · UIF · SDL', label: 'Payroll calculated on verified SARS tables' },
  { value: 'CSV · OFX · MT940', label: 'Bank statement formats supported for import and reconciliation' },
] as const;

export const features = [
  {
    icon: 'FileText',
    title: 'Invoicing and quotes',
    body: 'Branded quotes that convert to a tax invoice in one click, with credit notes and customer receipts to match — all in rands.',
  },
  {
    icon: 'Landmark',
    title: 'Bank import and reconciliation',
    body: 'Import bank statements (CSV, OFX/QFX, QIF or SWIFT MT940) and let Vertex suggest matches against your invoices and bills, with a full reconciliation workspace.',
  },
  {
    icon: 'Receipt',
    title: 'VAT201 and tax reports',
    body: 'Standard-rated, zero-rated and exempt supplies tracked correctly all year. Generate a VAT201 report straight from your posted transactions, ready for your own eFiling submission.',
  },
  {
    icon: 'Package',
    title: 'Inventory and fixed assets',
    body: 'Track stock with FIFO or weighted-average costing across warehouses, and run a full fixed-asset register with depreciation and disposals.',
  },
  {
    icon: 'Users',
    title: 'Payroll ready',
    body: 'Payslips, PAYE, UIF and SDL calculated on verified SARS tables, with EMP201 and EMP501 figures ready straight from your ledger.',
  },
  {
    icon: 'ShieldCheck',
    title: 'Multi-user with roles',
    body: 'Give your bookkeeper, accountant or team member their own access — admin, accountant, manager, operator or view-only — with every change logged to a full audit trail.',
  },
] as const;

export const showcase = [
  {
    kicker: 'Live dashboard',
    title: 'Know your cash position before you open the bank app',
    body: 'A single screen shows money in, money out, what is overdue and what VAT you owe — built from your real posted transactions.',
    bullets: ['Monthly cash flow, revenue and expenses tracked from posted transactions', 'Aged receivables ranked by risk', 'VAT liability building up as you post transactions'],
    variant: 'dashboard',
  },
  {
    kicker: 'Reconciliation',
    title: 'Reconcile a month of transactions over one cup of coffee',
    body: 'Vertex scores every imported statement line against your existing invoices, bills and transactions by date, amount and description, so you only review what it could not match confidently.',
    bullets: ['Match suggestions ranked by likelihood, not just amount', 'Supports CSV, OFX/QFX, QIF and SWIFT MT940 statement formats', 'Split transactions across accounts and VAT codes'],
    variant: 'reconcile',
  },
  {
    kicker: 'Compliance',
    title: 'VAT201 that is ready before the 25th',
    body: 'Every invoice and bill is coded as it is captured, so your VAT201 is built continuously instead of in a panic at month end.',
    bullets: ['Output and input tax broken down by treatment (standard, zero-rated, exempt)', 'Audit trail on every adjustment', 'Export a VAT201 summary ready for your own eFiling submission'],
    variant: 'vat',
  },
] as const;

export const comparison = {
  columns: ['Vertex', 'Sage Pastel', 'Xero'] as const,
  rows: [
    { label: 'Priced in rands, no forex surprises', values: [true, true, false] },
    { label: 'VAT201 built from your transactions, in ZAR', values: [true, true, false] },
    { label: 'Runs in the browser, nothing to install', values: [true, false, true] },
    { label: 'SA payroll with PAYE, UIF and SDL', values: [true, true, false] },
    { label: 'Unlimited invoices on every plan', values: [true, false, false] },
    { label: 'Accountant and view-only roles included', values: [true, false, false] },
    { label: 'Statement import for any SA bank (CSV, OFX, QIF, MT940)', values: [true, true, true] },
    { label: 'Full audit trail on every change', values: [true, false, false] },
  ],
} as const;

export interface Plan {
  id: string;
  name: string;
  blurb: string;
  monthly: number;
  includedUsers: number;
  popular?: boolean;
  features: string[];
}

/**
 * Plan prices are in ZAR, excluding VAT. INDICATIVE ONLY — there is no
 * live billing, payment gateway, trial enforcement or plan-limit
 * enforcement anywhere in this codebase (`Company.subscriptionTier` is an
 * unenforced free-text field). Nothing on this page can actually be
 * purchased; see Pricing.tsx's section copy for the disclaimer shown to
 * visitors.
 */
export const plans: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    blurb: 'Sole proprietors and side businesses finding their feet.',
    monthly: 199,
    includedUsers: 1,
    features: ['Unlimited invoices and quotes', 'Bank statement import', 'VAT201 report', 'Fixed asset register', 'Email support'],
  },
  {
    id: 'growth',
    name: 'Growth',
    blurb: 'Growing companies with a bookkeeper and a real chart of accounts.',
    monthly: 449,
    includedUsers: 3,
    popular: true,
    features: [
      'Everything in Starter',
      'Unlimited bank statement imports',
      'VAT201 report, ready for eFiling',
      'Smart match suggestions on import',
      'Accountant role included',
      'Priority email and phone support',
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    blurb: 'Established businesses with stock, projects and multiple entities.',
    monthly: 899,
    includedUsers: 10,
    features: [
      'Everything in Growth',
      'Inventory and job costing',
      'Fixed asset depreciation and disposals',
      'Full financial statements (income statement, balance sheet, cash flow)',
      'Dedicated account manager',
      'Named onboarding specialist',
    ],
  },
];

export interface AddOn {
  id: string;
  name: string;
  description: string;
  monthly: number;
  /** Per-unit add-ons render a quantity stepper instead of a checkbox. */
  perUnit?: boolean;
  unitLabel?: string;
  maxUnits?: number;
}

export const addOns: AddOn[] = [
  {
    id: 'payroll',
    name: 'Payroll module',
    description: 'Payslips, PAYE, UIF, SDL and EMP201 for up to 20 employees.',
    monthly: 149,
  },
  {
    id: 'multicurrency',
    name: 'FX toolkit',
    description: 'Track exchange rates and calculate FX gain/loss — a lightweight FX toolkit, not full multi-currency invoicing.',
    monthly: 99,
  },
  {
    id: 'onboarding',
    name: 'Manual data setup help',
    description: 'We help you capture your opening balances, customers and suppliers by hand — there is no automatic Pastel import yet.',
    monthly: 249,
  },
  {
    id: 'extraUsers',
    name: 'Extra users',
    description: 'Add team members beyond the seats included in your plan.',
    monthly: 79,
    perUnit: true,
    unitLabel: 'user',
    maxUnits: 25,
  },
];

export const VAT_RATE = 0.15;
export const ANNUAL_DISCOUNT = 0.2;

export const faqs = [
  {
    q: 'Can I bring my Sage Pastel data across?',
    a: "Vertex doesn't yet have a dedicated Pastel import tool. You can bring your chart of accounts, customers, suppliers and opening balances across manually, and your bank statements import directly (CSV, OFX/QFX, QIF or SWIFT MT940) so you are not re-typing transaction history.",
  },
  {
    q: 'How does Vertex handle VAT?',
    a: 'Every line you capture is coded as standard-rated, zero-rated, exempt or out of scope. Vertex accrues your output and input tax continuously and produces a VAT201 report broken down by tax treatment, ready for you to file with SARS eFiling yourself.',
  },
  {
    q: 'Does my accountant have to pay for a seat?',
    a: "There's no per-seat billing today. You can give your accountant or bookkeeper their own login with an accountant role, or give an auditor view-only access — everyone works in the same real file, so there is no emailing backups around.",
  },
  {
    q: 'Where is my data stored and is it POPIA compliant?',
    a: "Data is stored with Supabase and encrypted in transit and at rest. We haven't yet published a formal POPIA compliance statement or confirmed our hosting region publicly — get in touch if you need these details for a compliance review before going live.",
  },
  {
    q: 'Which banks do you support?',
    a: "Vertex doesn't have live bank feeds yet. You can import a statement from any bank that exports CSV, OFX/QFX, QIF or SWIFT MT940, and Vertex will suggest matches against your existing transactions.",
  },
  {
    q: 'Can I change or cancel my plan?',
    a: "There's no live billing yet, so the pricing shown here is indicative rather than something you can subscribe to online today. Contact us and we'll confirm plan and billing details directly.",
  },
  {
    q: 'Do you offer training for my team?',
    a: "We haven't published formal training materials or onboarding programmes yet — the in-app Help section covers the basics, and we're happy to walk through your books directly if you get in touch.",
  },
  {
    q: 'What happens after the 30-day trial?',
    a: "There's no trial-and-billing flow yet — right now you can explore Vertex through the live demo. Creating a real account doesn't charge you anything, because there's no billing system live yet either.",
  },
] as const;

export interface FooterLink {
  label: string;
  /** Omitted for links whose page hasn't been built yet — SiteFooter.tsx renders those as "#". */
  href?: string;
}

/**
 * Public-website-completion pass: `href` is only set once the real page
 * behind a link exists. Links with no `href` still render, just
 * pointing at "#", exactly as v0's original template did for every
 * link — this only narrows that set as real pages get built, per the
 * explicit "update footer links only when their corresponding real page
 * has been created" instruction. "Bank feeds" was also renamed to
 * "Banking" — the real page describes statement import and
 * reconciliation, not live feeds, and the old label would have
 * reintroduced the exact overclaim already corrected everywhere else on
 * this site.
 */
export const footerColumns: { heading: string; links: FooterLink[] }[] = [
  {
    heading: 'Product',
    links: [
      { label: 'Invoicing', href: '/product/invoicing' },
      { label: 'Banking', href: '/product/banking' },
      { label: 'VAT and tax', href: '/product/tax' },
      { label: 'Expenses', href: '/product/expenses' },
      { label: 'Payroll', href: '/product/payroll' },
      { label: 'Reporting', href: '/product/reporting' },
    ],
  },
  {
    heading: 'Solutions',
    links: [
      { label: 'Sole proprietors' },
      { label: 'Retail and hospitality' },
      { label: 'Construction' },
      { label: 'Professional services' },
      { label: 'Accountants and bookkeepers' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { label: 'Help centre', href: '/resources/help' },
      { label: 'VAT guide', href: '/resources/vat-guide' },
      { label: 'Switching from Pastel' },
      { label: 'Webinars' },
      { label: 'System status' },
    ],
  },
  {
    heading: 'Company',
    links: [{ label: 'About Vertex', href: '/company/about' }, { label: 'Careers' }, { label: 'Partner programme' }, { label: 'Contact sales', href: '/company/contact' }, { label: 'Press' }],
  },
] as const;
