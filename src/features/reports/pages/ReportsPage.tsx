import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';

interface ReportLink {
  href: string;
  name: string;
  description: string;
}

interface ReportCategory {
  category: string;
  reports: ReportLink[];
}

/**
 * Every real, working report in the app, grouped for the Report Library —
 * a pure navigation list, not a second data source. No favourites/
 * last-run/scheduling concepts: v0's own mock report library has all
 * three, but nothing in this app persists a per-user favourite, a report
 * run history, or a schedule, so none are shown here (M9) rather than
 * faked with localStorage. Trial Balance, General Ledger and VAT already
 * live under their own Accounting/Tax sections (M3/M7) — linked from here
 * too since a Reporting Centre should surface every real report regardless
 * of which top-level nav section owns it.
 */
const REPORT_LIBRARY: ReportCategory[] = [
  {
    category: 'Financial Statements',
    reports: [
      { href: '/reports/income-statement', name: 'Income Statement', description: 'Revenue, cost of sales, operating expenses and income tax down to Net Profit After Tax.' },
      { href: '/reports/balance-sheet', name: 'Balance Sheet', description: 'Assets, liabilities and equity as of a chosen date — proves Assets = Liabilities + Equity.' },
      { href: '/reports/cash-flow', name: 'Cash Flow Statement', description: 'Operating, investing and financing activities (indirect method), reconciled to actual cash movement.' },
    ],
  },
  {
    category: 'Accounting',
    reports: [
      { href: '/accounting/trial-balance', name: 'Trial Balance', description: 'Net posted balance per account, debit and credit columns, live as of now.' },
      { href: '/accounting/ledger', name: 'General Ledger', description: 'Every posted transaction line for a chosen account, running balance included.' },
    ],
  },
  {
    category: 'Receivables & Payables',
    reports: [
      { href: '/reports/customer-aging', name: 'Accounts Receivable Aging', description: 'Every customer, one row each, with Current/30/60/90+ outstanding buckets.' },
      { href: '/reports/supplier-aging', name: 'Accounts Payable Aging', description: 'Every supplier, one row each, with Current/30/60/90+ outstanding buckets.' },
    ],
  },
  {
    category: 'Tax',
    reports: [{ href: '/tax/vat-return', name: 'VAT Report', description: 'Output VAT charged on sales less input VAT claimed on purchases, for real posted documents only.' }],
  },
];

/**
 * Report Library / Reporting Centre — route `/reports`. Links out to every
 * real report page; renders nothing computed itself — each linked report
 * owns its own data-fetching and math. Revenue and expense figures are
 * reported through the Income Statement's Revenue/Cost of Sales/Operating
 * Expenses sections rather than as separate "Revenue report"/"Expense
 * report" pages — no standalone revenue or expense reporting-aggregation
 * service exists in this app beyond the Income Statement itself, so none is
 * fabricated here (M9). Re-skinned onto v0's PageHeader/SectionCard (M9);
 * see v0's own Report Library page for the category/list layout this
 * mirrors — favourites/last-run intentionally omitted (not real).
 */
export function ReportsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reports" description="Every statement and schedule available, grouped by the part of the business it reports on." />

      {REPORT_LIBRARY.map((group) => (
        <SectionCard key={group.category} title={group.category}>
          <div className="flex flex-col divide-y divide-border">
            {group.reports.map((report) => (
              <Link key={report.href} to={report.href} className="group flex items-center justify-between gap-4 py-3 no-underline first:pt-0 last:pb-0">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground group-hover:text-primary">{report.name}</span>
                  <span className="text-xs leading-relaxed text-muted-foreground">{report.description}</span>
                </div>
                <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </SectionCard>
      ))}
    </div>
  );
}
