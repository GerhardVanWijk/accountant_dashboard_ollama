import { useMemo, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/shadcn/dialog';
import { formatCurrency } from '@/lib/app/format';
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { useBills } from '../hooks/useBills';
import { useBillMutations } from '../hooks/useBillMutations';
import { usePayments, usePaymentMutations } from '../hooks';
import { BillList } from '../components/BillList';
import { BillDetail } from '../components/BillDetail';
import { BillForm } from '../components/BillForm';
import { PaymentForm } from '../components/PaymentForm';
import { nextDocumentNumber } from '../utils/nextDocumentNumber';

type View = { type: 'list' } | { type: 'detail'; id: string };

/**
 * Supplier bills — route `/purchases/bills` (nav label "Expenses" per v0's
 * own naming — v0's "Expenses" page is "supplier costs captured against
 * the ledger," which is exactly what a Bill already is in this codebase;
 * see the M8 report on why no separate Expense entity was invented).
 * Real useBills()/BillService data, v0 page shell, list/detail views, the
 * standalone-Bill create form, and Record Payment (which opens the same
 * real PaymentForm/paymentService the Supplier Payments page uses) — all
 * in-page-state, matching every other module's convention.
 */
export function BillsPage() {
  const [view, setView] = useState<View>({ type: 'list' });
  const [showCreate, setShowCreate] = useState(false);
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { bills, isLoading, error, refetch } = useBills();
  const { suppliers } = useSuppliers();
  const billMutations = useBillMutations();
  const { payments, refetch: refetchPayments } = usePayments();
  const { createPayment } = usePaymentMutations();

  const detailBill = view.type === 'detail' ? bills.find((b) => b.id === view.id) : undefined;

  const suppliersMap = useMemo(() => Object.fromEntries(suppliers.map((s) => [s.id, s.name])), [suppliers]);
  const outstandingBills = useMemo(() => bills.filter((bill) => bill.status !== 'void' && bill.total > bill.amountPaid), [bills]);

  const totalOutstanding = bills.reduce((sum, b) => sum + (b.status === 'void' ? 0 : b.total - b.amountPaid), 0);
  const overdueBills = bills.filter((b) => b.status === 'overdue');
  const draftBills = bills.filter((b) => b.status === 'draft');

  async function runAction(action: () => Promise<unknown>, successMessage?: string) {
    setActionError(null);
    try {
      await action();
      await refetch();
      if (successMessage) setNotice(successMessage);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed.');
    }
  }

  async function handleCreate(data: Parameters<typeof billMutations.createBill>[0]) {
    await billMutations.createBill(data);
    await refetch();
    setShowCreate(false);
    setNotice('Bill created as a draft.');
  }

  /** PaymentForm's own onSubmit handler already wraps this in try/catch and shows the error inline in the modal. */
  async function handleRecordPayment(data: Parameters<typeof createPayment>[0]) {
    await createPayment(data);
    await Promise.all([refetchPayments(), refetch()]);
    setShowRecordPayment(false);
    setNotice('Payment recorded and posted to the ledger.');
  }

  return (
    <>
      {view.type === 'list' && (
        <div className="flex flex-col gap-6">
          <PageHeader
            title="Expenses"
            description="Supplier bills captured against the ledger, with VAT and payment state."
            actions={
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus data-icon="inline-start" />
                New bill
              </Button>
            }
          />

          <SectionCard>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <FigureBlock label="Total bills" value={String(bills.length)} />
              <FigureBlock label="Outstanding" value={formatCurrency(totalOutstanding)} tone={totalOutstanding > 0 ? 'warning' : 'default'} />
              <FigureBlock label="Overdue" value={String(overdueBills.length)} tone={overdueBills.length > 0 ? 'negative' : 'default'} />
              <FigureBlock label="Drafts" value={String(draftBills.length)} hint="Not yet posted" />
            </div>
          </SectionCard>

          {notice && <p className="rounded-lg border border-status-positive-outline bg-status-positive-surface px-3 py-2 text-sm text-status-positive">{notice}</p>}
          {actionError && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {actionError}
            </p>
          )}

          {isLoading && (
            <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
              <p className="text-sm">Loading bills…</p>
            </div>
          )}
          {!isLoading && error && (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error.message}
            </div>
          )}
          {!isLoading && !error && (
            <BillList
              bills={bills}
              suppliersMap={suppliersMap}
              onSelect={(id) => {
                setNotice(null);
                setView({ type: 'detail', id });
              }}
            />
          )}
        </div>
      )}

      {view.type === 'detail' && detailBill && (
        <div className="flex flex-col gap-6">
          {notice && <p className="rounded-lg border border-status-positive-outline bg-status-positive-surface px-3 py-2 text-sm text-status-positive">{notice}</p>}
          {actionError && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {actionError}
            </p>
          )}
          <BillDetail
            bill={detailBill}
            suppliersMap={suppliersMap}
            onClose={() => setView({ type: 'list' })}
            onPost={(id) => void runAction(() => billMutations.postBill(id), 'Bill posted to the ledger.')}
            onRecordPayment={() => setShowRecordPayment(true)}
          />
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>New Bill</DialogTitle>
          </DialogHeader>
          <BillForm suppliers={suppliers} defaultBillNumber={nextDocumentNumber(bills.map((b) => b.billNumber), 'BILL')} onSubmit={handleCreate} onCancel={() => setShowCreate(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={showRecordPayment && Boolean(detailBill)} onOpenChange={setShowRecordPayment}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{detailBill ? `Record Payment — ${detailBill.billNumber}` : 'Record Payment'}</DialogTitle>
          </DialogHeader>
          {detailBill && (
            <PaymentForm
              suppliers={suppliers}
              outstandingBills={outstandingBills}
              defaultPaymentNumber={nextDocumentNumber(payments.map((p) => p.paymentNumber), 'PAY')}
              presetBillId={detailBill.id}
              onSubmit={handleRecordPayment}
              onCancel={() => setShowRecordPayment(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
