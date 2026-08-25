import { Button } from '@/components/ui/shadcn/button';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/shadcn/empty';
import { formatDate } from '@/lib/app/format';
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
 * `ExchangeRateService.getRateForDate()` uses. Kept as a purpose-built
 * table (grouped sub-tables, one per pair) rather than the generic
 * DataTable — that grouping doesn't fit the flat-rows abstraction.
 * Re-skinned onto v0's visual language (M13).
 */
export function ExchangeRateTable({ rates, onEdit, onDelete }: ExchangeRateTableProps) {
  const pairs = [...new Set(rates.map((r) => `${r.fromCurrency}/${r.toCurrency}`))].sort();

  if (pairs.length === 0) {
    return (
      <Empty>
        <EmptyTitle>No exchange rates recorded yet</EmptyTitle>
        <EmptyDescription>Add one to get started.</EmptyDescription>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {pairs.map((pair) => {
        const [fromCurrency, toCurrency] = pair.split('/');
        const versions = rates.filter((r) => r.fromCurrency === fromCurrency && r.toCurrency === toCurrency).sort((a, b) => b.rateDate.localeCompare(a.rateDate));

        return (
          <div key={pair} className="flex flex-col gap-2">
            <h3 className="figure text-sm font-semibold">{pair}</h3>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">Rate</th>
                    <th className="whitespace-nowrap px-4 py-2.5 font-medium text-muted-foreground">Rate date</th>
                    <th className="whitespace-nowrap px-4 py-2.5 font-medium text-muted-foreground">Source</th>
                    <th className="whitespace-nowrap px-4 py-2.5 font-medium text-muted-foreground" />
                  </tr>
                </thead>
                <tbody>
                  {versions.map((rate) => (
                    <tr key={rate.id} className="border-t border-border">
                      <td className="figure whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{rate.rate}</td>
                      <td className="whitespace-nowrap px-4 py-2.5">{formatDate(rate.rateDate)}</td>
                      <td className="max-w-xs truncate px-4 py-2.5 text-muted-foreground" title={rate.sourceReference}>
                        {rate.sourceReference}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => onEdit(rate)}>
                            Edit
                          </Button>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => onDelete(rate)}>
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
