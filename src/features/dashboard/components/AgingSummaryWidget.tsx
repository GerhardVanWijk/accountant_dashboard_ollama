import type { CurrencyCode } from '@/types';
import type { IconName } from '@/config/icons';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { formatCurrency } from '@/utils/formatCurrency';
import type { FleetAgingBuckets } from '../types/aging.types';

export interface AgingSummaryWidgetProps {
  title: string;
  icon: IconName;
  buckets: FleetAgingBuckets;
  currency: CurrencyCode;
}

const BUCKET_ROWS: ReadonlyArray<{ key: keyof Omit<FleetAgingBuckets, 'total'>; label: string; dotClassName: string }> = [
  { key: 'current', label: 'Current', dotClassName: 'bg-success' },
  { key: 'bucket30', label: '1-30 days', dotClassName: 'bg-info' },
  { key: 'bucket60', label: '31-60 days', dotClassName: 'bg-warning' },
  { key: 'bucket90Plus', label: '61+ days', dotClassName: 'bg-danger' },
];

/**
 * Shared presentation for the Accounts-Receivable and Accounts-Payable
 * aging widgets — same Current/30/60/90+ breakdown shape
 * (../types/aging.types.ts), just a different title/icon/dataset per
 * caller. Renders only the already-aggregated `buckets` it's given (see
 * ../utils/calculateArAging.ts / ../utils/calculateApAging.ts).
 */
export function AgingSummaryWidget({ title, icon, buckets, currency }: AgingSummaryWidgetProps) {
  return (
    <Card>
      <h3 className="mb-md flex items-center gap-sm text-base font-semibold text-text-primary">
        <Icon name={icon} size={18} className="text-primary" />
        {title}
      </h3>

      <p className="text-2xl font-semibold text-text-primary">{formatCurrency(buckets.total, currency)}</p>
      <p className="mb-md text-xs text-text-secondary">Total outstanding</p>

      <ul className="flex flex-col gap-xs">
        {BUCKET_ROWS.map(({ key, label, dotClassName }) => (
          <li key={key} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-xs text-text-secondary">
              <span className={`h-2 w-2 rounded-full ${dotClassName}`} aria-hidden="true" />
              {label}
            </span>
            <span className="font-medium text-text-primary">{formatCurrency(buckets[key], currency)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
