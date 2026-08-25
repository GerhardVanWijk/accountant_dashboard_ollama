import { Amount } from '@/components/app/figure';
import { cn } from '@/lib/utils';

export interface StatementRowProps {
  label: string;
  amount: number;
  /** Category/grand totals — bold text, top border. */
  isTotal?: boolean;
  /** Individual account lines nest under their category header. */
  indent?: boolean;
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
export function StatementRow({ label, amount, isTotal = false, indent = false }: StatementRowProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-[1fr_auto] items-baseline gap-2 py-2',
        isTotal && 'mt-1 border-t border-border font-semibold text-foreground',
      )}
    >
      <span className={cn(indent && !isTotal && 'pl-4 text-muted-foreground')}>{label}</span>
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
