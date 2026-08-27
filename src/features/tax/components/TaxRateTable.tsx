import { Button } from '@/components/ui/shadcn/button';
import { Badge } from '@/components/ui/shadcn/badge';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/shadcn/empty';
import { ListTree } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/app/format';
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
 * Groups every tax rate version by `code`, newest first within each group
 * — the effective-dated "rate history" view (reproduces what a historical
 * transaction actually used). Only the currently-open version of an
 * active code can be superseded or deactivated; every past version is
 * read-only, shown for traceability. Kept as a purpose-built grouped
 * table rather than the shared DataTable — same reasoning as Chart of
 * Accounts' hierarchy table (M3): DataTable's flat sort model has no
 * group-header-row concept and would flatten away the real version
 * history. Re-skinned onto shadcn Table/Badge/Empty (M7); grouping and
 * supersede/deactivate logic unchanged.
 */
export function TaxRateTable({ taxRates, onSupersede, onDeactivate }: TaxRateTableProps) {
  const codes = [...new Set(taxRates.map((r) => r.code))].sort();

  if (codes.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ListTree />
          </EmptyMedia>
          <EmptyTitle>No tax codes yet</EmptyTitle>
          <EmptyDescription>Create one to get started.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {codes.map((code) => {
        const versions = taxRates.filter((r) => r.code === code).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
        const current = versions.find(isCurrentlyOpen);

        return (
          <div key={code} className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium text-muted-foreground">Code</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium text-muted-foreground">Treatment</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">Rate</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium text-muted-foreground">Effective From</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium text-muted-foreground">Effective To</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium text-muted-foreground" />
                </tr>
              </thead>
              <tbody>
                {versions.map((rate) => (
                  <tr key={rate.id} className={cn('border-t border-border', !isCurrentlyOpen(rate) && 'text-muted-foreground')}>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono">{rate.code}</td>
                    <td className="whitespace-nowrap px-4 py-2.5">{rate.name}</td>
                    <td className="whitespace-nowrap px-4 py-2.5">{treatmentLabels[rate.treatment]}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{rate.rate}%</td>
                    <td className="whitespace-nowrap px-4 py-2.5">{formatDate(rate.effectiveFrom)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5">{rate.effectiveTo ? formatDate(rate.effectiveTo) : '—'}</td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      {!rate.isActive ? (
                        <Badge variant="outline">Deactivated</Badge>
                      ) : isCurrentlyOpen(rate) ? (
                        <Badge className="bg-status-positive/15 text-status-positive">Current</Badge>
                      ) : (
                        <Badge variant="outline">Superseded</Badge>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      {rate.id === current?.id && rate.isActive && (
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => onSupersede(rate)}>
                            Supersede
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => onDeactivate(rate)}>
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
