import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { FinancialTableCell } from '@/components/tables/FinancialTableCell';
import { formatCurrency } from '@/utils/formatFinancial';
import type { CashFlowSection } from '../services';

export interface CashFlowSectionTableProps {
  title: string;
  section: CashFlowSection;
}

/**
 * One classified section of the Statement of Cash Flows (Operating,
 * Investing, or Financing) — its line items followed by a subtotal row.
 * Grid-based, right-aligned tabular-nums numbers, mirroring the row/total
 * convention `src/features/reports/financialStatements/components/
 * StatementRow.tsx` uses for the Income Statement/Balance Sheet, so every
 * report in the Reports module renders amounts the same way (that folder is
 * owned by a parallel dispatch — not imported from here, the class strings
 * are simply matched for visual consistency).
 */
export function CashFlowSectionTable({ title, section }: CashFlowSectionTableProps) {
  return (
    <div>
      <div className="px-2 pb-xs pt-md text-xs font-semibold uppercase tracking-wide text-text-secondary">{title}</div>
      {section.items.map((item) => (
        <div key={item.label} className="grid grid-cols-[1fr_160px] gap-2 px-2 py-1 tabular-nums">
          <FinancialTableCell type="label" className="pl-lg text-text-secondary">
            {item.label}
          </FinancialTableCell>
          <FinancialTableCell type="number">
            <FinancialNumber value={item.amount} format={formatCurrency} showFlash={false} />
          </FinancialTableCell>
        </div>
      ))}
      <div className="mt-xs grid grid-cols-[1fr_160px] gap-2 border-t border-border bg-panel px-2 py-1 font-semibold tabular-nums">
        <FinancialTableCell type="label">Net Cash from {title}</FinancialTableCell>
        <FinancialTableCell type="number">
          <FinancialNumber value={section.total} format={formatCurrency} showFlash={false} />
        </FinancialTableCell>
      </div>
    </div>
  );
}
