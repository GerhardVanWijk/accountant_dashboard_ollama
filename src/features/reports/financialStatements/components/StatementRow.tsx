import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { FinancialTableCell } from '@/components/tables/FinancialTableCell';
import { formatCurrency } from '@/utils/formatFinancial';

export interface StatementRowProps {
  label: string;
  amount: number;
  /** Category/grand totals — bold text, top border, subtle panel tint. */
  isTotal?: boolean;
  /** Individual account lines nest under their category header. */
  indent?: boolean;
  /** Expenses/deductions: a positive amount here is a cost, not a gain. */
  isInverted?: boolean;
}

/**
 * One row of an Income Statement or Balance Sheet — grid-based, right-
 * aligned tabular-nums amount per docs/FINANCIAL_UI_GUIDE.md. Shared by
 * both financialStatements pages so every report in this feature renders
 * amounts identically.
 */
export function StatementRow({ label, amount, isTotal = false, indent = false, isInverted = false }: StatementRowProps) {
  return (
    <div
      className={`grid grid-cols-[1fr_160px] gap-2 px-2 py-1 tabular-nums ${
        isTotal ? 'mt-xs border-t border-border bg-panel font-semibold' : ''
      }`}
    >
      <FinancialTableCell type="label" className={indent && !isTotal ? 'pl-lg text-text-secondary' : undefined}>
        {label}
      </FinancialTableCell>
      <FinancialTableCell type="number">
        <FinancialNumber value={amount} format={formatCurrency} isInverted={isInverted} />
      </FinancialTableCell>
    </div>
  );
}

export interface StatementSectionHeaderProps {
  label: string;
}

/** Category header — "Revenue", "Operating Expenses", "Assets", etc. */
export function StatementSectionHeader({ label }: StatementSectionHeaderProps) {
  return <div className="px-2 pt-md pb-xs text-xs font-semibold uppercase tracking-wide text-text-secondary">{label}</div>;
}
