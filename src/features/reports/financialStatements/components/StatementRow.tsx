import { useNavigate } from 'react-router-dom';
import { Amount } from '@/components/app/figure';
import { RecordLink } from '@/components/app/record-link';
import { cn } from '@/lib/utils';
import { useAccountingUiStore } from '@/features/accounting/store/accountingUiStore';

export interface StatementRowProps {
  label: string;
  amount: number;
  /** Category/grand totals — bold text, top border. */
  isTotal?: boolean;
  /** Individual account lines nest under their category header. */
  indent?: boolean;
  /** When set (an individual account line, never a total), the label drills into that account's General Ledger activity. */
  accountId?: string;
}

/**
 * One row of an Income Statement or Balance Sheet. Re-skinned onto v0's
 * statement-table visual language (M9): negatives shown parenthesized via
 * `Amount`'s `statement` mode (the accounting convention), not a separate
 * "+"/inverted-color scheme — matches how v0's own StatementTable renders
 * every row in one plain, undyed color regardless of section, distinguished
 * by heading/indentation rather than per-row color. Shared by the Income
 * Statement and Balance Sheet pages so both render amounts identically.
 */
export function StatementRow({ label, amount, isTotal = false, indent = false, accountId }: StatementRowProps) {
  const navigate = useNavigate();
  const setSelectedLedgerAccountId = useAccountingUiStore((s) => s.setSelectedLedgerAccountId);

  return (
    <div
      className={cn(
        'grid grid-cols-[1fr_auto] items-baseline gap-2 py-2',
        isTotal && 'mt-1 border-t border-border font-semibold text-foreground',
      )}
    >
      {accountId ? (
        <span className={cn(indent && !isTotal && 'pl-4')}>
          <RecordLink
            onClick={() => {
              setSelectedLedgerAccountId(accountId);
              navigate('/accounting/ledger');
            }}
            className="text-sm"
          >
            {label}
          </RecordLink>
        </span>
      ) : (
        <span className={cn(indent && !isTotal && 'pl-4 text-muted-foreground')}>{label}</span>
      )}
      <Amount value={amount} statement className={cn('text-sm', isTotal && 'font-semibold')} />
    </div>
  );
}

export interface StatementSectionHeaderProps {
  label: string;
}

/** Category header — "Revenue", "Operating Expenses", "Assets", etc. */
export function StatementSectionHeader({ label }: StatementSectionHeaderProps) {
  return <div className="pt-6 pb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase first:pt-0">{label}</div>;
}
