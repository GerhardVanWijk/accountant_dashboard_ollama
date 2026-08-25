/**
 * Marketing copy/data for the public homepage, ported verbatim from
 * accounting-v0-frontend/lib/landing-content.ts (M6:
 * docs/SUPABASE_MIGRATION_GUIDE.md's sibling UI-port initiative — see
 * docs/V0_DESIGN_SYSTEM_PORT... the v0 project is source of truth for this
 * page's design/content, per the user's explicit "do not redesign/rebuild"
 * instruction). Only `brand.signInHref`/`signUpHref`/`demoHref` are changed
 * from v0's originals (`/signin` for all three, a Next.js-only route that
 * doesn't exist in this app) — remapped to this app's real routes:
 * `/login` for sign-in, `/signup` for both sign-up and "book a demo" (no
 * real demo-booking flow exists anywhere in this app, so the closest real
 * destination is the actual signup flow, not a dead link). Every other
 * value (prices, testimonials, FAQ, comparison rows, plan features) is
 * marketing content, not business logic — left exactly as v0 authored it.
 */

export const brand = {
  name: 'Vertex',
  fullName: 'Vertex Accounting Solutions',
  tagline: 'Cloud accounting built for South African business',
  ctaPrimary: 'Start 30-day free trial',
  ctaSecondary: 'Book a live demo',
  signInHref: '/login',
  signUpHref: '/signup',
  demoHref: '/signup',
} as const;

export const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'Product', href: '#product' },
  { label: 'Why switch', href: '#compare' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
] as const;

export const hero = {
  eyebrow: 'Now with automated VAT201 submissions',
  headline: 'Accounting that speaks',
  headlineAccent: 'South African',
  headlineEnd: 'business.',
  subhead:
    'Invoice in rands, reconcile your FNB, Absa and Standard Bank feeds automatically, and file VAT201 without a spreadsheet in sight. Vertex replaces Pastel and Xero for thousands of local businesses.',
  trustLine: ['15% VAT ready', 'SARS eFiling', 'POPIA compliant', 'Local support'],
} as const;

export const integrations = ['FNB', 'Standard Bank', 'Absa', 'Nedbank', 'Capitec Business', 'PayFast', 'Yoco', 'SARS eFiling'] as const;

export const stats = [
  { value: '12 400+', label: 'SA businesses on Vertex' },
  { value: 'R48bn', label: 'Invoiced through the platform' },
  { value: '11 hrs', label: 'Saved per month, on average' },
  { value: '99.98%', label: 'Uptime over the last 12 months' },
] as const;

export const features = [
  {
    icon: 'FileText',
    title: 'Invoicing and quotes',
    body: 'Branded quotes that convert to tax invoices in one click, with recurring billing and automatic payment reminders in ZAR.',
  },
  {
    icon: 'Landmark',
    title: 'Bank feeds and reconciliation',
    body: 'Direct feeds from the big five SA banks. Vertex suggests matches and learns your rules, so reconciliation takes minutes.',
  },
  {
    icon: 'Receipt',
    title: 'VAT201 and tax reports',
    body: 'Standard, zero-rated and exempt supplies tracked correctly all year. Generate a VAT201 and submit straight to eFiling.',
  },
  {
    icon: 'Camera',
    title: 'Expense and slip capture',
    body: 'Snap a slip on your phone, Vertex reads the supplier, total and VAT, then files it against the right expense account.',
  },
  {
    icon: 'Users',
    title: 'Payroll ready',
    body: 'Payslips, PAYE, UIF and SDL calculated on current SARS tables, with EMP201 figures posted straight to your ledger.',
  },
  {
    icon: 'ShieldCheck',
    title: 'Multi-user with roles',
    body: 'Invite your bookkeeper, accountant or auditor with owner, accountant or view-only access. Every change is logged.',
  },
] as const;

export const showcase = [
  {
    kicker: 'Live dashboard',
    title: 'Know your cash position before you open the bank app',
    body: 'A single screen shows money in, money out, what is overdue and what VAT you owe. Refreshed the moment a transaction lands.',
    bullets: ['Cashflow forecast for the next 90 days', 'Aged receivables ranked by risk', 'VAT liability accruing in real time'],
    variant: 'dashboard',
  },
  {
    kicker: 'Reconciliation',
    title: 'Reconcile a month of transactions over one cup of coffee',
    body: 'Vertex matches statement lines to invoices and bills, remembers how you categorise recurring payments, and flags only what needs a human.',
    bullets: ['Automatic matching with confidence scores', 'Bank rules for rent, fuel and subscriptions', 'Split transactions across accounts and VAT codes'],
    variant: 'reconcile',
  },
  {
    kicker: 'Compliance',
    title: 'VAT201 that is ready before the 25th',
    body: 'Every invoice, bill and slip is coded as it is captured, so your return is built continuously instead of in a panic at month end.',
    bullets: ['Output and input tax broken down per field', 'Audit trail on every adjustment', 'Submit to SARS eFiling from inside Vertex'],
    variant: 'vat',
  },
] as const;

export const comparison = {
  columns: ['Vertex', 'Sage Pastel', 'Xero'] as const,
  rows: [
    { label: 'Priced in rands, no forex surprises', values: [true, true, false] },
    { label: 'VAT201 built and submitted to eFiling', values: [true, true, false] },
    { label: 'Runs in the browser, nothing to install', values: [true, false, true] },
    { label: 'SA payroll with PAYE, UIF and SDL', values: [true, true, false] },
    { label: 'Unlimited invoices on every plan', values: [true, false, false] },
    { label: 'Free accountant and auditor seats', values: [true, false, false] },
    { label: 'Support in SA business hours', values: [true, true, false] },
    { label: 'Migration from Pastel done for you', values: [true, false, false] },
  ],
} as const;

export const testimonials = [
  {
    quote:
      'We moved eleven years of Pastel data across in a weekend. Month end used to take me four days — it now takes an afternoon, and my accountant works in the same file I do.',
    name: 'Thandi Mokoena',
    role: 'Financial Manager',
    company: 'Kagiso Logistics, Midrand',
    featured: true,
  },
  {
    quote: 'The bank feed from Standard Bank alone paid for the subscription. Reconciliation is genuinely a ten-minute job now.',
    name: 'Riaan de Villiers',
    role: 'Owner',
    company: 'Cape Fitters',
    featured: false,
  },
  {
    quote: 'VAT used to be the most stressful week of my month. Vertex builds the VAT201 as we go, so I just review and submit.',
    name: 'Nadia Patel',
    role: 'Practice Owner',
    company: 'Patel Accounting, Durban',
    featured: false,
  },
] as const;

export interface Plan {
  id: string;
  name: string;
  blurb: string;
  monthly: number;
  includedUsers: number;
  popular?: boolean;
  features: string[];
}

/** Plan prices are in ZAR, excluding VAT. */
export const plans: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    blurb: 'Sole proprietors and side businesses finding their feet.',
    monthly: 199,
    includedUsers: 1,
    features: ['Unlimited invoices and quotes', '1 bank feed', 'VAT201 report', 'Slip capture on mobile', 'Email support'],
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
      'Unlimited bank feeds',
      'VAT201 submission to eFiling',
      'Bank rules and auto-matching',
      'Free accountant seat',
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
      'Multi-entity consolidation',
      'Custom report builder',
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
    name: 'Multi-currency',
    description: 'Invoice and hold balances in USD, EUR, GBP and 30 more.',
    monthly: 99,
  },
  {
    id: 'onboarding',
    name: 'Pastel migration service',
    description: 'We move your history, opening balances and customers across.',
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
    a: 'Yes. Vertex imports your customers, suppliers, chart of accounts, opening balances and transaction history from Pastel Partner, Pastel Xpress and Pastel One. On Growth and Premium a migration specialist does the work for you and reconciles the opening balances with you on a call.',
  },
  {
    q: 'How does Vertex handle VAT?',
    a: 'Every line you capture is coded as standard rated at 15%, zero rated, exempt or out of scope. Vertex accrues your output and input tax continuously, produces a VAT201 broken down per field, and submits it to SARS eFiling on the Growth and Premium plans.',
  },
  {
    q: 'Does my accountant have to pay for a seat?',
    a: 'No. Growth and Premium include a free accountant seat, and auditors can be given time-limited view-only access at no cost. They work in the same live file you do, so there is no more emailing backups around.',
  },
  {
    q: 'Where is my data stored and is it POPIA compliant?',
    a: 'Data is encrypted in transit and at rest, hosted in South African and EU regions, and backed up continuously. We process personal information in line with POPIA and will sign an operator agreement on request.',
  },
  {
    q: 'Which banks do you support?',
    a: 'Direct feeds are live for FNB, Standard Bank, Absa, Nedbank and Capitec Business, with statement import for any bank that offers OFX, QIF or CSV downloads.',
  },
  {
    q: 'Can I change or cancel my plan?',
    a: 'Change plans or add-ons at any time from your account settings — the change is prorated to the day. Monthly plans can be cancelled with no penalty and you keep read-only access to your records for 12 months.',
  },
  {
    q: 'Do you offer training for my team?',
    a: 'Every plan includes guided setup and our video library. Premium adds live training sessions for your finance team and a named onboarding specialist for the first 90 days.',
  },
  {
    q: 'What happens after the 30-day trial?',
    a: 'Nothing is charged during the trial and no card is required to start. At the end you pick a plan and your data carries over exactly as it is. If you do nothing, the account simply pauses.',
  },
] as const;

export const footerColumns = [
  {
    heading: 'Product',
    links: ['Invoicing', 'Bank feeds', 'VAT and tax', 'Expenses', 'Payroll', 'Reporting'],
  },
  {
    heading: 'Solutions',
    links: ['Sole proprietors', 'Retail and hospitality', 'Construction', 'Professional services', 'Accountants and bookkeepers'],
  },
  {
    heading: 'Resources',
    links: ['Help centre', 'VAT guide', 'Switching from Pastel', 'Webinars', 'System status'],
  },
  {
    heading: 'Company',
    links: ['About Vertex', 'Careers', 'Partner programme', 'Contact sales', 'Press'],
  },
] as const;
