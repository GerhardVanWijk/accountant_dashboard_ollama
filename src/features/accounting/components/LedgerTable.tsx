import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { FinancialTableCell } from '@/components/tables/FinancialTableCell';
import { formatCurrency } from '@/utils/formatFinancial';
import type { LedgerRow } from '../services';

export interface LedgerTableProps {
  rows: LedgerRow[];
}

/**
 * Renders journalEntryService.getAccountLedger() rows in date order with
 * the running balance it already computed — no running-balance math
 * happens in this component (docs/LEDGER_ARCHITECTURE.md).
 */
export function LedgerTable({ rows }: LedgerTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <div className="grid grid-cols-[110px_100px_1fr_140px_140px_160px] gap-2 border-b border-border bg-background px-md py-sm tabular-nums text-xs font-semibold uppercase tracking-wide text-text-secondary">
        <FinancialTableCell type="label">Date</FinancialTableCell>
        <FinancialTableCell type="label">Entry #</FinancialTableCell>
        <FinancialTableCell type="label">Memo</FinancialTableCell>
        <FinancialTableCell type="number">Debit</FinancialTableCell>
        <FinancialTableCell type="number">Credit</FinancialTableCell>
        <FinancialTableCell type="number">Running Balance</FinancialTableCell>
      </div>
      {rows.map((row, index) => (
        <div
          key={`${row.entryId}_${index}`}
          className="grid grid-cols-[110px_100px_1fr_140px_140px_160px] gap-2 border-b border-border px-md py-sm tabular-nums text-sm last:border-0"
        >
          <FinancialTableCell type="label" className="text-text-secondary">
            {new Date(row.date).toLocaleDateString()}
          </FinancialTableCell>
          <FinancialTableCell type="label" className="font-mono">
            {row.entryNumber}
          </FinancialTableCell>
          <FinancialTableCell type="label" className="text-text-secondary">
            {row.memo ?? '—'}
          </FinancialTableCell>
          <FinancialTableCell type="number">
            {row.debit > 0 ? <FinancialNumber value={row.debit} format={formatCurrency} showFlash={false} /> : '—'}
          </FinancialTableCell>
          <FinancialTableCell type="number">
            {row.credit > 0 ? <FinancialNumber value={row.credit} format={formatCurrency} showFlash={false} /> : '—'}
          </FinancialTableCell>
          <FinancialTableCell type="number" className="font-semibold">
            <FinancialNumber value={row.runningBalance} format={formatCurrency} showFlash={false} />
          </FinancialTableCell>
        </div>
      ))}
    </div>
  );
}
