import type { CurrencyCode } from '@/types';
import { formatCurrency } from '@/utils/formatCurrency';
import { cn } from '@/utils/cn';
import type { AgingBuckets } from '../utils/calculateAging';

export interface CustomerAgingBreakdownProps {
  aging: AgingBuckets;
  currency: CurrencyCode;
}

const bucketLabels: { key: keyof Omit<AgingBuckets, 'total'>; label: string }[] = [
  { key: 'current', label: 'Current' },
  { key: 'days30', label: '1-30 Days' },
  { key: 'days60', label: '31-60 Days' },
  { key: 'days90Plus', label: '90+ Days' },
];

/**
 * Literal Tailwind width classes (never a runtime-interpolated arbitrary
 * value, per docs/DO_NOT_BREAK.md "no inline styles") rounded to the
 * nearest 10% for the aging bar fill.
 */
const widthByTenth = [
  'w-0',
  'w-[10%]',
  'w-[20%]',
  'w-[30%]',
  'w-[40%]',
  'w-1/2',
  'w-[60%]',
  'w-[70%]',
  'w-[80%]',
  'w-[90%]',
  'w-full',
] as const;

function widthClassFor(percent: number): string {
  const index = Math.max(0, Math.min(10, Math.round(percent / 10)));
  return widthByTenth[index];
}

/**
 * Current/30/60/90+ aging breakdown, driven entirely by the pre-computed
 * AgingBuckets result of calculateAging — no math happens in this
 * component, per docs/DO_NOT_BREAK.md.
 */
export function CustomerAgingBreakdown({ aging, currency }: CustomerAgingBreakdownProps) {
  return (
    <div className="grid grid-cols-2 gap-sm sm:grid-cols-4">
      {bucketLabels.map(({ key, label }) => {
        const value = aging[key];
        const percent = aging.total > 0 ? Math.round((value / aging.total) * 100) : 0;
        return (
          <div key={key} className="rounded-md border border-border p-md">
            <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">{label}</p>
            <p className="mt-xs text-lg font-semibold text-text-primary">{formatCurrency(value, currency)}</p>
            <div className="mt-sm h-1.5 w-full overflow-hidden rounded-full bg-background">
              <div className={cn('h-full rounded-full bg-primary', widthClassFor(percent))} />
            </div>
            <p className="mt-xs text-xs text-text-muted">{percent}% of outstanding</p>
          </div>
        );
      })}
    </div>
  );
}
