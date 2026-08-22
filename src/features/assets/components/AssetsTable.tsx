import type { FixedAsset, FixedAssetStatus } from '@/types';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';
import { cn } from '@/utils/cn';
import { CATEGORY_LABELS } from '../constants';

const STATUS_STYLES: Record<FixedAssetStatus, string> = {
  draft: 'bg-text-muted/10 text-text-secondary',
  active: 'bg-positive/10 text-positive',
  fully_depreciated: 'bg-warning/10 text-warning-financial',
  disposed: 'bg-text-muted/10 text-text-muted',
};

const STATUS_LABELS: Record<FixedAssetStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  fully_depreciated: 'Fully Depreciated',
  disposed: 'Disposed',
};

export interface AssetsTableProps {
  assets: FixedAsset[];
  onEdit: (asset: FixedAsset) => void;
  onPostAcquisition: (asset: FixedAsset) => void;
  onDelete: (asset: FixedAsset) => void;
}

export function AssetsTable({ assets, onEdit, onPostAcquisition, onDelete }: AssetsTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[860px] border-collapse text-left text-sm">
        <thead className="bg-background">
          <tr>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Asset #</th>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Name</th>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Category</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Cost</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Accum. Depreciation</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Carrying Value</th>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Status</th>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary" />
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => {
            const carryingValue = asset.cost - asset.accumulatedDepreciation;
            return (
              <tr key={asset.id} className="border-t border-border hover:bg-background">
                <td className="whitespace-nowrap px-md py-sm font-mono text-text-primary">{asset.assetNumber}</td>
                <td className="whitespace-nowrap px-md py-sm text-text-primary">{asset.name}</td>
                <td className="whitespace-nowrap px-md py-sm text-text-primary">{CATEGORY_LABELS[asset.category]}</td>
                <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                  <FinancialNumber value={asset.cost} format={formatCurrency} showFlash={false} />
                </td>
                <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                  <FinancialNumber value={asset.accumulatedDepreciation} format={formatCurrency} showFlash={false} isInverted />
                </td>
                <td className="whitespace-nowrap px-md py-sm text-right font-semibold tabular-nums">
                  <FinancialNumber value={carryingValue} format={formatCurrency} showFlash={false} />
                </td>
                <td className="whitespace-nowrap px-md py-sm">
                  <span className={cn('inline-flex items-center rounded-full px-sm py-0.5 text-xs font-medium', STATUS_STYLES[asset.status])}>
                    {STATUS_LABELS[asset.status]}
                  </span>
                </td>
                <td className="whitespace-nowrap px-md py-sm">
                  <div className="flex justify-end gap-sm">
                    {asset.status === 'draft' && (
                      <button
                        type="button"
                        onClick={() => onPostAcquisition(asset)}
                        className="rounded-md px-sm py-xs text-xs font-medium text-primary hover:underline"
                      >
                        Post Acquisition
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onEdit(asset)}
                      className="rounded-md px-sm py-xs text-xs font-medium text-primary hover:underline"
                    >
                      Edit
                    </button>
                    {asset.status === 'draft' && (
                      <button
                        type="button"
                        onClick={() => onDelete(asset)}
                        className="rounded-md px-sm py-xs text-xs font-medium text-danger hover:underline"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
