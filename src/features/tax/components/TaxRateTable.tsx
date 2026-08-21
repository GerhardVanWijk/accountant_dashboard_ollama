import { Button } from '@/components/ui/Button';
import { cn } from '@/utils/cn';
import type { TaxRate } from '@/types';
import { treatmentLabels } from '../utils/treatmentLabels';

export interface TaxRateTableProps {
  taxRates: TaxRate[];
  onSupersede: (rate: TaxRate) => void;
  onDeactivate: (rate: TaxRate) => void;
}

function isCurrentlyOpen(rate: TaxRate): boolean {
  return !rate.effectiveTo;
}

/**
 * Groups every tax rate version by `code`, newest first within each
 * group — the "rate history" view SA_ACCOUNTING_MASTER_SPEC.md §82
 * requires (reproduce what a historical transaction actually used).
 * Only the currently-open version of an active code can be superseded or
 * deactivated; every past version is read-only, shown for traceability.
 */
export function TaxRateTable({ taxRates, onSupersede, onDeactivate }: TaxRateTableProps) {
  const codes = [...new Set(taxRates.map((r) => r.code))].sort();

  if (codes.length === 0) {
    return <p className="text-sm text-text-muted">No tax codes yet — create one to get started.</p>;
  }

  return (
    <div className="flex flex-col gap-lg">
      {codes.map((code) => {
        const versions = taxRates
          .filter((r) => r.code === code)
          .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
        const current = versions.find(isCurrentlyOpen);

        return (
          <div key={code} className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead className="bg-background">
                <tr>
                  <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Code</th>
                  <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Name</th>
                  <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Treatment</th>
                  <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Rate</th>
                  <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Effective From</th>
                  <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Effective To</th>
                  <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Status</th>
                  <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary" />
                </tr>
              </thead>
              <tbody>
                {versions.map((rate) => (
                  <tr key={rate.id} className={cn('border-t border-border/50', !isCurrentlyOpen(rate) && 'text-text-muted')}>
                    <td className="whitespace-nowrap px-md py-sm font-mono">{rate.code}</td>
                    <td className="whitespace-nowrap px-md py-sm">{rate.name}</td>
                    <td className="whitespace-nowrap px-md py-sm">{treatmentLabels[rate.treatment]}</td>
                    <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">{rate.rate}%</td>
                    <td className="whitespace-nowrap px-md py-sm">{new Date(rate.effectiveFrom).toLocaleDateString()}</td>
                    <td className="whitespace-nowrap px-md py-sm">
                      {rate.effectiveTo ? new Date(rate.effectiveTo).toLocaleDateString() : '—'}
                    </td>
                    <td className="whitespace-nowrap px-md py-sm">
                      {!rate.isActive ? (
                        <span className="rounded-full bg-background px-sm py-0.5 text-xs font-semibold text-text-muted">
                          Deactivated
                        </span>
                      ) : isCurrentlyOpen(rate) ? (
                        <span className="rounded-full bg-positive/10 px-sm py-0.5 text-xs font-semibold text-positive">
                          Current
                        </span>
                      ) : (
                        <span className="rounded-full bg-background px-sm py-0.5 text-xs font-semibold text-text-muted">
                          Superseded
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-md py-sm">
                      {rate.id === current?.id && rate.isActive && (
                        <div className="flex justify-end gap-sm">
                          <Button variant="ghost" onClick={() => onSupersede(rate)}>
                            Supersede
                          </Button>
                          <Button variant="ghost" onClick={() => onDeactivate(rate)}>
                            Deactivate
                          </Button>
                        </div>
                      )}
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
