import type { CurrencyCode } from '@/types';
import { Card } from '@/components/ui/Card';
import { formatCurrency } from '@/utils/formatCurrency';
import { cn } from '@/utils/cn';
import type { CustomerFinancialSummary } from '../utils/customerFinancials';

export interface CustomerSummaryCardsProps {
  summary: CustomerFinancialSummary;
  currency: CurrencyCode;
}

interface Tile {
  label: string;
  value: string;
  emphasis?: 'danger' | 'success';
}

/**
 * Financial summary cards for the Customer Hub (Total Outstanding, Overdue
 * Balance, Available Credit, YTD Sales) — all values arrive pre-computed
 * from the customerFinancials util, never calculated in JSX.
 */
export function CustomerSummaryCards({ summary, currency }: CustomerSummaryCardsProps) {
  const tiles: Tile[] = [
    { label: 'Total Outstanding', value: formatCurrency(summary.totalOutstanding, currency) },
    {
      label: 'Overdue Balance',
      value: formatCurrency(summary.overdueBalance, currency),
      emphasis: summary.overdueBalance > 0 ? 'danger' : undefined,
    },
    {
      label: 'Available Credit',
      value: summary.availableCredit === null ? 'No limit set' : formatCurrency(summary.availableCredit, currency),
      emphasis: summary.availableCredit !== null && summary.availableCredit < 0 ? 'danger' : 'success',
    },
    { label: 'YTD Sales', value: formatCurrency(summary.ytdSales, currency) },
  ];

  return (
    <div className="grid grid-cols-1 gap-md sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((tile) => (
        <Card
          key={tile.label}
          className={cn(
            'flex flex-col gap-xs',
            // Accent color used as a decorative border only — per
            // docs/DESIGN_SYSTEM.md accents never fill body/value text.
            tile.emphasis === 'danger' && 'border-l-4 border-l-danger',
            tile.emphasis === 'success' && 'border-l-4 border-l-success',
          )}
        >
          <span className="text-xs font-medium uppercase tracking-wide text-text-secondary">{tile.label}</span>
          <span className="text-xl font-semibold text-text-primary">{tile.value}</span>
        </Card>
      ))}
    </div>
  );
}
