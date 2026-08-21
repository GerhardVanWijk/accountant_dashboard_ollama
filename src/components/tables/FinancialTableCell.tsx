/**
 * FinancialTableCell — grid-based table cell for financial data.
 *
 * Use when building data tables for:
 * - Invoices, bills, orders (line items with prices/quantities)
 * - Bank statements (transactions with debits/credits)
 * - P&L reports (revenue/expense/net columns)
 * - Ledger entries (debit/credit columns)
 *
 * Pattern: Use fixed-width grid columns with right-aligned numbers.
 * Never center numbers — eye can't compare magnitudes.
 */

import React from 'react';

interface FinancialTableCellProps {
  /** The content to display */
  children: React.ReactNode;

  /** Cell type: 'label' (left-aligned), 'number' (right-aligned), 'status' (centered) */
  type?: 'label' | 'number' | 'status';

  /** Additional CSS classes */
  className?: string;

  /** Data attribute for custom styling (e.g., data-type="positive") */
  dataType?: string;

  /** Column width as CSS value (e.g., "120px", "20%") */
  width?: string;
}

/**
 * Renders a single table cell with proper alignment and styling for financial data.
 * Always pair with grid-based layout for stable column widths.
 *
 * @example
 * // Table row with grid layout (see FinancialTableRow for full example)
 * <div className="grid grid-cols-[2fr_120px_120px_120px] gap-2 tabular-nums">
 *   <FinancialTableCell type="label">Invoice #INV-001</FinancialTableCell>
 *   <FinancialTableCell type="number">$1,234.56</FinancialTableCell>
 *   <FinancialTableCell type="number">$0.00</FinancialTableCell>
 *   <FinancialTableCell type="number">$1,234.56</FinancialTableCell>
 * </div>
 */
export const FinancialTableCell: React.FC<FinancialTableCellProps> = ({
  children,
  type = 'label',
  className = '',
  dataType,
  width,
}) => {
  const alignmentClass = type === 'label' ? 'text-left' : type === 'status' ? 'text-center' : 'text-right';

  const style = width ? { width } : undefined;

  return (
    <div
      className={`
        px-2 py-2 text-sm
        ${alignmentClass}
        ${className}
      `}
      data-type={dataType}
      style={style}
    >
      {children}
    </div>
  );
};
