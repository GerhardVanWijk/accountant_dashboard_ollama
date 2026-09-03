import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PencilIcon } from 'lucide-react';
import {
  RecordActionBar,
  RecordActivitySection,
  RecordPageHeader,
  RecordPageShell,
} from '@/components/app/record-page';
import { StatusBadge } from '@/components/app/status-badge';
import { ConfirmDialog } from '@/components/app/form';
import { formatDate } from '@/lib/app/format';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { useAccounts } from '@/features/accounting/hooks/useAccounts';
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { useTaxRates } from '@/features/tax/hooks/useTaxRates';
import { useSupplierReturns } from '../hooks/useSupplierReturns';
import { useProducts } from '../hooks/useProducts';
import { useWarehouses } from '../hooks/useWarehouses';
import { useAccountingEffectPreview } from '../hooks/useAccountingEffectPreview';
import { SupplierReturnDetail } from '../components/SupplierReturnDetail';
import { SupplierReturnDocumentFormModal } from '../components/SupplierReturnDocumentFormModal';
import type { UpdateSupplierReturnDTO } from '../services/supplierReturnService';

/**
 * Full-page Supplier Return detail — route
 * `/inventory/supplier-returns/:supplierReturnId`. Supplier, reason, lines
 * at cost, and the Purchase Price Variance journal preview (shown even at
 * R0.00) on the page width. Same supplierReturnService.postSupplierReturn()
 * call — WAC / PPV accounting unchanged.
 */
export function SupplierReturnDetailPage() {
  const { supplierReturnId } = useParams<{ supplierReturnId: string }>();
  const navigate = useNavigate();

  const {
    supplierReturns, loading, error,
    updateSupplierReturn, postSupplierReturn, cancelSupplierReturn, previewPostEffect,
  } = useSupplierReturns();
  const supplierReturn = supplierReturns.find((r) => r.id === supplierReturnId);
  const { products } = useProducts();
  const { warehouses } = useWarehouses();
  const { suppliers } = useSuppliers();
  const { taxRates } = useTaxRates();
  const { accounts } = useAccounts();
  const canManage = useCanAccess('inventory', 'update');

  const { preview, previewLoading, previewError } = useAccountingEffectPreview(previewPostEffect, supplierReturn?.id);

  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setActionError(null);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'That action failed.');
    } finally {
      setBusy(false);
    }
  }

  const supplierName = supplierReturn ? suppliers.find((s) => s.id === supplierReturn.supplierId)?.name ?? supplierReturn.supplierId : '';
  const state = loading ? 'loading' : error ? 'error' : supplierReturn ? 'ready' : 'not-found';

  return (
    <RecordPageShell
      breadcrumbs={[{ label: 'Inventory', to: '/inventory' }, { label: 'Supplier returns', to: '/inventory/supplier-returns' }, { label: supplierReturn?.returnNumber ?? 'Supplier return' }]}
      backTo="/inventory/supplier-returns"
      backLabel="Supplier returns"
      state={state}
      errorMessage={error?.message}
      notFoundMessage="This supplier return could not be found — it may have been deleted."
    >
      {supplierReturn && (
        <>
          <RecordPageHeader
            recordNumber={supplierReturn.returnNumber}
            title={supplierName}
            meta={`Return date ${formatDate(supplierReturn.returnDate)}${supplierReturn.reason ? ` · ${supplierReturn.reason}` : ''}`}
            status={<StatusBadge status={supplierReturn.status} />}
            actions={
              canManage && supplierReturn.status === 'draft' ? (
                <RecordActionBar
                  busy={busy}
                  primary={{ label: 'Post', onClick: () => void run(() => postSupplierReturn(supplierReturn.id)) }}
                  secondary={[{ label: 'Edit', icon: PencilIcon, onClick: () => setEditing(true) }]}
                  danger={[{ label: 'Cancel return', onClick: () => setConfirmCancel(true) }]}
                />
              ) : undefined
            }
          />

          {actionError && (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {actionError}
            </div>
          )}

          <SupplierReturnDetail
            supplierReturn={supplierReturn}
            products={products}
            warehouses={warehouses}
            suppliers={suppliers}
            accounts={accounts}
            preview={preview}
            previewLoading={previewLoading}
            previewError={previewError}
            onOpenJournal={(journalEntryId) => navigate(`/accounting/journals?record=${journalEntryId}`)}
          />

          <RecordActivitySection recordType="SupplierReturn" recordId={supplierReturn.id} title="Record activity" subtitle="Changes and lifecycle events for this supplier return." />

          <ConfirmDialog
            open={confirmCancel}
            onOpenChange={setConfirmCancel}
            title={`Cancel ${supplierReturn.returnNumber}?`}
            description="This cancels the return before it posts. This cannot be undone."
            confirmLabel="Cancel return"
            destructive
            onConfirm={() => {
              setConfirmCancel(false);
              void run(() => cancelSupplierReturn(supplierReturn.id));
            }}
          />

          {editing && (
            <SupplierReturnDocumentFormModal
              supplierReturn={supplierReturn}
              products={products}
              warehouses={warehouses}
              suppliers={suppliers}
              taxRates={taxRates}
              onSubmit={async (data) => {
                await updateSupplierReturn(supplierReturn.id, data as UpdateSupplierReturnDTO);
                setEditing(false);
              }}
              onClose={() => setEditing(false)}
            />
          )}
        </>
      )}
    </RecordPageShell>
  );
}
