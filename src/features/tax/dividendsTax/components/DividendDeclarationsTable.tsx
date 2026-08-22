import type { DividendDeclaration, DividendDeclarationStatus } from '@/types';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { FinancialTableCell } from '@/components/tables/FinancialTableCell';
import { formatCurrency } from '@/utils/formatFinancial';
import { cn } from '@/utils/cn';
import { getRemittanceDueDateHint } from '../services';

const STATUS_STYLES: Record<DividendDeclarationStatus, string> = {
  draft: 'bg-text-muted/10 text-text-secondary',
  declared: 'bg-info-financial/10 text-info-financial',
  paid: 'bg-warning/10 text-warning-financial',
  remitted: 'bg-positive/10 text-positive',
};

const STATUS_LABELS: Record<DividendDeclarationStatus, string> = {
  draft: 'Draft',
  declared: 'Declared',
  paid: 'Paid',
  remitted: 'Remitted',
};

export interface DividendDeclarationsTableProps {
  declarations: DividendDeclaration[];
  onDeclare: (declaration: DividendDeclaration) => void;
  onPay: (declaration: DividendDeclaration) => void;
  onRemit: (declaration: DividendDeclaration) => void;
  onDelete: (declaration: DividendDeclaration) => void;
}

const GRID_COLS = 'grid-cols-[110px_1fr_120px_120px_120px_120px_110px_1fr]';

export function DividendDeclarationsTable({ declarations, onDeclare, onPay, onRemit, onDelete }: DividendDeclarationsTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <div className={cn('grid min-w-[1100px] gap-2 border-b border-border bg-background px-md py-sm tabular-nums', GRID_COLS)}>
        <FinancialTableCell type="label" className="font-medium text-text-secondary">
          Date
        </FinancialTableCell>
        <FinancialTableCell type="label" className="font-medium text-text-secondary">
          Total Amount
        </FinancialTableCell>
        <FinancialTableCell type="number" className="font-medium text-text-secondary">
          Exempt
        </FinancialTableCell>
        <FinancialTableCell type="number" className="font-medium text-text-secondary">
          Taxable
        </FinancialTableCell>
        <FinancialTableCell type="number" className="font-medium text-text-secondary">
          Tax Withheld
        </FinancialTableCell>
        <FinancialTableCell type="number" className="font-medium text-text-secondary">
          Net Payable
        </FinancialTableCell>
        <FinancialTableCell type="status" className="font-medium text-text-secondary">
          Status
        </FinancialTableCell>
        <FinancialTableCell type="label" className="font-medium text-text-secondary">
          {''}
        </FinancialTableCell>
      </div>

      <div className="divide-y divide-border/50">
        {declarations.map((d) => (
          <div key={d.id} className={cn('grid min-w-[1100px] gap-2 px-md py-sm tabular-nums hover:bg-background', GRID_COLS)}>
            <FinancialTableCell type="label" className="whitespace-nowrap font-mono text-text-primary">
              {d.declarationDate}
            </FinancialTableCell>
            <FinancialTableCell type="label">
              <FinancialNumber value={d.totalAmount} format={formatCurrency} showFlash={false} />
            </FinancialTableCell>
            <FinancialTableCell type="number">
              <FinancialNumber value={d.exemptPortion} format={formatCurrency} showFlash={false} isInverted />
            </FinancialTableCell>
            <FinancialTableCell type="number">
              <FinancialNumber value={d.taxableAmount} format={formatCurrency} showFlash={false} />
            </FinancialTableCell>
            <FinancialTableCell type="number">
              <FinancialNumber value={d.dividendsTaxWithheld} format={formatCurrency} showFlash={false} isInverted />
            </FinancialTableCell>
            <FinancialTableCell type="number" className="font-semibold">
              <FinancialNumber value={d.netPayableToShareholders} format={formatCurrency} showFlash={false} />
            </FinancialTableCell>
            <FinancialTableCell type="status">
              <span className={cn('inline-flex items-center rounded-full px-sm py-0.5 text-xs font-medium', STATUS_STYLES[d.status])}>
                {STATUS_LABELS[d.status]}
              </span>
            </FinancialTableCell>
            <FinancialTableCell type="label">
              <div className="flex flex-wrap items-center justify-end gap-sm">
                {d.status === 'draft' && (
                  <>
                    <button
                      type="button"
                      onClick={() => onDeclare(d)}
                      className="rounded-md px-sm py-xs text-xs font-medium text-primary hover:underline"
                    >
                      Declare
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(d)}
                      className="rounded-md px-sm py-xs text-xs font-medium text-danger hover:underline"
                    >
                      Delete
                    </button>
                  </>
                )}
                {d.status === 'declared' && (
                  <button
                    type="button"
                    onClick={() => onPay(d)}
                    className="rounded-md px-sm py-xs text-xs font-medium text-primary hover:underline"
                  >
                    Pay
                  </button>
                )}
                {d.status === 'paid' && (
                  <div className="flex flex-col items-end gap-0.5">
                    <button
                      type="button"
                      onClick={() => onRemit(d)}
                      className="rounded-md px-sm py-xs text-xs font-medium text-primary hover:underline"
                    >
                      Remit to SARS
                    </button>
                    {d.paidDate && (
                      <span className="text-xs text-text-secondary">Due by {getRemittanceDueDateHint(d.paidDate)}</span>
                    )}
                  </div>
                )}
              </div>
            </FinancialTableCell>
          </div>
        ))}
      </div>
    </div>
  );
}
