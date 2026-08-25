import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/shadcn/button';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/shadcn/table';
import { formatCurrency, formatDate } from '@/lib/app/format';
import type { Bill } from '@/types';

export interface BillDetailProps {
  bill: Bill;
  suppliersMap?: Record<string, string>;
  onClose?: () => void;
  /** Posts the bill to the GL via billService.postBill() — draft only. */
  onPost?: (billId: string) => void;
  onRecordPayment?: (billId: string) => void;
}

/**
 * Supplier bill detail — re-skinned onto v0's PageHeader/SectionCard (M8),
 * same action gating as before the port: Post only while draft, Record
 * Payment only once posted with an outstanding balance. No delete/void
 * action here — matches BillService's own real capabilities (a posted
 * bill has no void/reverse method).
 */
export function BillDetail({ bill, suppliersMap = {}, onClose, onPost, onRecordPayment }: BillDetailProps) {
  const outstandingAmount = bill.total - bill.amountPaid;
  const supplierName = suppliersMap[bill.supplierId] ?? bill.supplierId;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={bill.billNumber}
        description={supplierName}
        actions={
          <>
            {onClose && (
              <Button variant="outline" size="sm" onClick={onClose}>
                Back
              </Button>
            )}
            {onPost && bill.status === 'draft' && (
              <Button size="sm" onClick={() => onPost(bill.id)}>
                Post Bill
              </Button>
            )}
            {onRecordPayment && bill.status !== 'draft' && bill.status !== 'void' && outstandingAmount > 0 && (
              <Button size="sm" onClick={() => onRecordPayment(bill.id)}>
                Record Payment
              </Button>
            )}
          </>
        }
      />

      <div className="flex items-center gap-2">
        <StatusBadge status={bill.status} />
      </div>

      <SectionCard title="Bill from" description={supplierName}>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <div className="text-xs tracking-wide text-muted-foreground uppercase">Bill date</div>
            <div className="text-sm font-medium">{formatDate(bill.issueDate)}</div>
          </div>
          <div>
            <div className="text-xs tracking-wide text-muted-foreground uppercase">Due date</div>
            <div className="text-sm font-medium">{formatDate(bill.dueDate)}</div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Line items">
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Line Total</TableHead>
                <TableHead className="text-right">VAT</TableHead>
                <TableHead className="text-right">Gross Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bill.lineItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.description}</TableCell>
                  <TableCell className="text-right tabular-nums">{item.quantity.toFixed(2)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(item.unitPrice)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(item.lineTotal)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(item.taxAmount)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatCurrency(item.lineTotal + item.taxAmount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={5} className="text-right">
                  Subtotal
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(bill.subtotal)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell colSpan={5} className="text-right">
                  VAT (Input)
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(bill.taxTotal)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell colSpan={5} className="text-right font-semibold">
                  Total due
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(bill.total)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </SectionCard>

      <SectionCard title="Payment status">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FigureBlock label="Amount paid" value={formatCurrency(bill.amountPaid)} tone="positive" />
          <FigureBlock label="Outstanding" value={formatCurrency(outstandingAmount)} tone={outstandingAmount > 0 ? 'warning' : 'default'} />
        </div>
      </SectionCard>

      {bill.notes && (
        <SectionCard title="Notes">
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{bill.notes}</p>
        </SectionCard>
      )}
    </div>
  );
}
