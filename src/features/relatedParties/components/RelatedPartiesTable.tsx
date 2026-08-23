import type { RelatedParty } from '@/types/relatedParty';
import { cn } from '@/utils/cn';
import { RELATIONSHIP_TYPE_LABELS } from '../constants';

export interface RelatedPartiesTableProps {
  relatedParties: RelatedParty[];
  transactionCountByPartyId: Map<string, number>;
  onEdit: (relatedParty: RelatedParty) => void;
  onDelete: (relatedParty: RelatedParty) => void;
}

/** Related Party Register table — mirrors src/features/assets/components/AssetsTable.tsx's shape. */
export function RelatedPartiesTable({ relatedParties, transactionCountByPartyId, onEdit, onDelete }: RelatedPartiesTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <thead className="bg-background">
          <tr>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Name</th>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Relationship Type</th>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Detail</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Transactions</th>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Status</th>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary" />
          </tr>
        </thead>
        <tbody>
          {relatedParties.map((relatedParty) => {
            const transactionCount = transactionCountByPartyId.get(relatedParty.id) ?? 0;
            return (
              <tr key={relatedParty.id} className="border-t border-border hover:bg-background">
                <td className="whitespace-nowrap px-md py-sm text-text-primary">{relatedParty.name}</td>
                <td className="whitespace-nowrap px-md py-sm text-text-primary">{RELATIONSHIP_TYPE_LABELS[relatedParty.relationshipType]}</td>
                <td className="max-w-xs truncate px-md py-sm text-text-secondary">{relatedParty.relationshipDetail ?? '—'}</td>
                <td className="whitespace-nowrap px-md py-sm text-right tabular-nums text-text-primary">{transactionCount}</td>
                <td className="whitespace-nowrap px-md py-sm">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-sm py-0.5 text-xs font-medium',
                      relatedParty.isActive ? 'bg-positive/10 text-positive' : 'bg-text-muted/10 text-text-muted',
                    )}
                  >
                    {relatedParty.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="whitespace-nowrap px-md py-sm">
                  <div className="flex justify-end gap-sm">
                    <button
                      type="button"
                      onClick={() => onEdit(relatedParty)}
                      className="rounded-md px-sm py-xs text-xs font-medium text-primary hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(relatedParty)}
                      disabled={transactionCount > 0}
                      title={transactionCount > 0 ? 'Referenced by an existing related-party transaction — remove those first.' : undefined}
                      className="rounded-md px-sm py-xs text-xs font-medium text-danger hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:no-underline"
                    >
                      Delete
                    </button>
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
