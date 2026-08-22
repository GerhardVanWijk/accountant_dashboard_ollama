import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import type { IconName } from '@/config/icons';

interface ReportLink {
  path: string;
  title: string;
  description: string;
  icon: IconName;
}

const REPORT_LINKS: ReportLink[] = [
  {
    path: '/reports/income-statement',
    title: 'Income Statement',
    description: 'Revenue, Cost of Goods Sold, operating expenses, and Income Tax Expense down to Net Profit After Tax.',
    icon: 'reports',
  },
  {
    path: '/reports/balance-sheet',
    title: 'Balance Sheet',
    description: 'Assets, liabilities, and equity as of a chosen date — proves Assets = Liabilities + Equity.',
    icon: 'reports',
  },
  {
    path: '/reports/cash-flow',
    title: 'Cash Flow Statement',
    description: 'Operating, investing, and financing activities (indirect method), reconciled to the real Cash and Bank movement.',
    icon: 'reports',
  },
  {
    path: '/reports/customer-aging',
    title: 'Customer Aging Report',
    description: 'Every customer, one row each, with Current/30/60/90+ outstanding buckets.',
    icon: 'customers',
  },
  {
    path: '/reports/supplier-aging',
    title: 'Supplier Aging Report',
    description: 'Every supplier, one row each, with Current/30/60/90+ outstanding buckets.',
    icon: 'suppliers',
  },
];

/**
 * Financial Statements Hub — links out to each real report page. This
 * page itself renders nothing computed; each linked report owns its own
 * data-fetching and math (docs/DO_NOT_BREAK.md: never calculate financial
 * figures inline in JSX).
 */
export function ReportsPage() {
  return (
    <div className="flex flex-col gap-lg">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Financial Statements Hub</h1>
        <p className="mt-xs text-sm text-text-secondary">/reports</p>
      </div>
      <div className="grid grid-cols-1 gap-md md:grid-cols-2 lg:grid-cols-3">
        {REPORT_LINKS.map((link) => (
          <Link key={link.path} to={link.path} className="block no-underline">
            <Card className="flex h-full flex-col gap-sm transition-colors hover:border-accent">
              <div className="flex items-center gap-sm">
                <Icon name={link.icon} className="h-5 w-5 text-text-secondary" />
                <h2 className="text-sm font-semibold text-text-primary">{link.title}</h2>
              </div>
              <p className="text-xs text-text-secondary">{link.description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
