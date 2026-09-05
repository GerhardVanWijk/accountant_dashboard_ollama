import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { useLegacyRecordRedirect } from '@/components/app/record-page';
import { formatCurrency } from '@/lib/app/format';
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { useBills } from '../hooks/useBills';
import { useBillMutations } from '../hooks/useBillMutations';
import { BillList } from '../components/BillList';
import { BillFormModal } from '../components/BillFormModal';
import { nextDocumentNumber } from '../utils/nextDocumentNumber';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';

/**
 * Supplier bills — route `/purchases/bills` (nav label "Expenses"), the
 * list only. A row click navigates to the full-page record at
 * `/purchases/bills/:billId` (BillDetailPage); legacy `?record=<id>` deep
 * links are redirected there. Post and Record Payment live on the record
 * page.
 */
export function BillsPage() {
  const navigate = useNavigate();
  useLegacyRecordRedirect('/purchases/bills');

  const [showCreate, setShowCreate] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const { bills, isLoading, error, refetch } = useBills();
  const { suppliers } = useSuppliers();
  const billMutations = useBillMutations();
  const canCreate = useCanAccess('purchasing', 'create');

  const suppliersMap = useMemo(() => Object.fromEntries(suppliers.map((s) => [s.id, s.name])), [suppliers]);

  const totalOutstanding = bills.reduce((sum, b) => sum + (b.status === 'void' ? 0 : b.total - b.amountPaid), 0);
  const overdueBills = bills.filter((b) => b.status === 'overdue');
  const draftBills = bills.filter((b) => b.status === 'draft');

  async function handleCreate(data: Parameters<typeof billMutations.createBill>[0]) {
    await billMutations.createBill(data);
    await refetch();
    setShowCreate(false);
    setNotice('Bill created as a draft.');
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Expenses"
          description="Supplier bills captured against the ledger, with VAT and payment state."
          actions={
            canCreate ? (
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus data-icon="inline-start" />
                New bill
              </Button>
            ) : undefined
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

        {isLoading ? (
          <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            <p className="text-sm">Loading bills…</p>
          </div>
        ) : error ? (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error.message}
          </div>
        ) : (
          <BillList
            bills={bills}
            suppliersMap={suppliersMap}
            onSelect={(id) => {
              setNotice(null);
              navigate(`/purchases/bills/${id}`);
            }}
          />
        )}
      </div>

      {showCreate && (
        <BillFormModal
          suppliers={suppliers}
          defaultBillNumber={nextDocumentNumber(bills.map((b) => b.billNumber), 'BILL')}
          onSubmit={handleCreate}
          onClose={() => setShowCreate(false)}
        />
      )}
    </>
  );
}
