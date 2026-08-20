import type { CurrencyCode } from '@/types';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/utils/cn';
import { formatCurrency } from '@/utils/formatCurrency';

export interface KpiCardProps {
  label: string;
  value: number;
  currency: CurrencyCode;
  /** Percentage change vs the prior period. Omit to hide the trend row (e.g. a stat with no comparable prior period). */
  trendPercent?: number;
  /**
   * When false, a rising value reads as unfavorable (danger) rather than
   * favorable (success) — e.g. Expenses, where "up" is bad news. Default
   * true.
   */
  positiveIsGood?: boolean;
}

/**
 * Executive Dashboard KPI stat tile. Renders only the already-computed
 * value/trendPercent it's given — see ../utils/calculateKpis.ts for the
 * math (never computed inline here, per docs/DO_NOT_BREAK.md).
 */
export function KpiCard({ label, value, currency, trendPercent, positiveIsGood = true }: KpiCardProps) {
  const hasTrend = typeof trendPercent === 'number' && Number.isFinite(trendPercent);
  const isUp = hasTrend && trendPercent >= 0;
  const isFavorable = hasTrend && (positiveIsGood ? isUp : !isUp);

  return (
    <Card>
      <p className="text-sm text-text-secondary">{label}</p>
      <p className="mt-xs text-2xl font-semibold text-text-primary">{formatCurrency(value, currency)}</p>
      {hasTrend && (
        <p
          className={cn(
            'mt-xs flex items-center gap-xs text-sm font-medium',
            isFavorable ? 'text-success' : 'text-danger',
          )}
        >
          <Icon name={isUp ? 'trendUp' : 'trendDown'} size={14} />
          <span>
            {isUp ? '+' : ''}
            {trendPercent.toFixed(1)}% vs prior period
          </span>
        </p>
      )}
    </Card>
  );
}
