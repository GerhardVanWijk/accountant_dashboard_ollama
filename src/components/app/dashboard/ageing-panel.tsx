import { Amount } from '@/components/app/figure';
import { formatCurrency } from '@/lib/app/format';

export interface AgeingBucketView {
  bucket: 'Current' | '30 days' | '60 days' | '90+ days';
  amount: number;
}

const toneFor: Record<AgeingBucketView['bucket'], string> = {
  Current: 'bg-status-positive',
  '30 days': 'bg-status-info',
  '60 days': 'bg-status-warning',
  '90+ days': 'bg-status-negative',
};

/**
 * Adapted from accounting-v0-frontend/components/app/dashboard/ageing-panel.tsx.
 * v0's AgeingBucket carried an `invoiceCount` per bucket and rendered it
 * next to each row; the real aging aggregate this app computes
 * (src/features/dashboard/types/aging.types.ts's FleetAgingBuckets, via
 * src/features/dashboard/utils/calculateArAging.ts/calculateApAging.ts)
 * has no such count anywhere in its pipeline — neither the per-customer/
 * per-supplier aging util it's built from tracks it. Rather than invent a
 * count or extend the accounting aging logic to add one, that row is
 * simply omitted here; everything else (proportional bar, total, per-
 * bucket amount) is real. Tone classes use status-* (see
 * tailwind.config.js's Phase M0 comment), not the bare positive/negative/
 * warning/info this app's financial-number system already owns.
 */
export function AgeingPanel({
  buckets,
  emptyLabel,
}: {
  buckets: AgeingBucketView[];
  emptyLabel: string;
}) {
  const total = buckets.reduce((sum, bucket) => sum + bucket.amount, 0);

  if (total === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Total outstanding
        </span>
        <span className="figure text-lg font-semibold tabular-nums">
          {formatCurrency(total)}
        </span>
      </div>

      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        {buckets.map((bucket) => (
          <div
            key={bucket.bucket}
            className={toneFor[bucket.bucket]}
            style={{ width: `${(bucket.amount / total) * 100}%` }}
          />
        ))}
      </div>

      <ul className="flex flex-col gap-3">
        {buckets.map((bucket) => (
          <li
            key={bucket.bucket}
            className="flex items-center justify-between gap-4"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={`size-2 shrink-0 rounded-full ${toneFor[bucket.bucket]}`}
                aria-hidden="true"
              />
              <span className="truncate text-sm">{bucket.bucket}</span>
            </span>
            <Amount value={bucket.amount} className="text-sm" />
          </li>
        ))}
      </ul>
    </div>
  );
}
