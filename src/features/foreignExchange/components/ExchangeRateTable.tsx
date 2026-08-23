import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type { ExchangeRate } from '@/types/foreignExchange';

export interface ExchangeRateTableProps {
  rates: ExchangeRate[];
  onEdit: (rate: ExchangeRate) => void;
  onDelete: (rate: ExchangeRate) => void;
}

/**
 * Every recorded rate, grouped by currency pair then sorted by `rateDate`
 * descending within each group — the most recent rate for a pair is always
 * the first row, matching the "last known rate" resolution
 * `ExchangeRateService.getRateForDate()` uses.
 */
export function ExchangeRateTable({ rates, onEdit, onDelete }: ExchangeRateTableProps) {
  const pairs = [...new Set(rates.map((r) => `${r.fromCurrency}/${r.toCurrency}`))].sort();

  if (pairs.length === 0) {
    return <p className="text-sm text-text-muted">No exchange rates recorded yet — add one to get started.</p>;
  }

  return (
    <div className="flex flex-col gap-lg">
      {pairs.map((pair) => {
        const [fromCurrency, toCurrency] = pair.split('/');
        const versions = rates
          .filter((r) => r.fromCurrency === fromCurrency && r.toCurrency === toCurrency)
          .sort((a, b) => b.rateDate.localeCompare(a.rateDate));

        return (
          <div key={pair} className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead className="bg-background">
                <tr>
                  <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Pair</th>
                  <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Rate</th>
                  <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Rate Date</th>
                  <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Source</th>
                  <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary" />
                </tr>
              </thead>
              <tbody>
                {versions.map((rate) => (
                  <tr key={rate.id} className="border-t border-border/50">
                    <td className="whitespace-nowrap px-md py-sm font-mono">
                      {rate.fromCurrency}/{rate.toCurrency}
                    </td>
                    <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">{rate.rate}</td>
                    <td className="whitespace-nowrap px-md py-sm">{new Date(rate.rateDate).toLocaleDateString()}</td>
                    <td className="max-w-xs truncate px-md py-sm text-text-secondary" title={rate.sourceReference}>
                      {rate.sourceReference}
                    </td>
                    <td className="whitespace-nowrap px-md py-sm">
                      <div className="flex justify-end gap-sm">
                        <Button variant="ghost" onClick={() => onEdit(rate)} aria-label={`Edit ${pair} rate`}>
                          <Icon name="edit" size={16} />
                        </Button>
                        <Button variant="ghost" onClick={() => onDelete(rate)} aria-label={`Delete ${pair} rate`}>
                          <Icon name="delete" size={16} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
