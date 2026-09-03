import { useState } from 'react';

import { FormShell, FormHeader } from '@/components/app/form';
import { newUuid } from '@/lib/uuid';
import { AllocationForm, type AllocationFormProps, type OpenInvoiceOption } from './AllocationForm';

export type { OpenInvoiceOption };

export interface AllocationFormModalProps extends Omit<AllocationFormProps, 'onCancel' | 'onDirtyChange' | 'onSubmit'> {
  title: string;
  onClose: () => void;
  /**
   * `allocationId` is a stable UUID for this modal instance — re-used if the
   * submit is retried, fresh when the modal is reopened for a new
   * allocation. Consumers that don't apply a customer deposit (credit-note
   * allocation) can ignore it.
   */
  onSubmit: (invoiceId: string, amount: number, allocationId: string) => Promise<void>;
}

/** `AllocationForm` in the shared Vertex form shell (P3G). */
export function AllocationFormModal({ title, onClose, onSubmit, ...formProps }: AllocationFormModalProps) {
  const [dirty, setDirty] = useState(false);
  const [allocationId] = useState(() => newUuid());
  return (
    <FormShell open onClose={onClose} size="sm" mode="edit" isDirty={dirty}>
      <FormHeader title={title} />
      <AllocationForm
        {...formProps}
        onSubmit={(invoiceId, amount) => onSubmit(invoiceId, amount, allocationId)}
        onCancel={onClose}
        onDirtyChange={setDirty}
      />
    </FormShell>
  );
}
