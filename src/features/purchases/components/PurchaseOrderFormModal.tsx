import { useState } from 'react';

import { FormShell, FormHeader } from '@/components/app/form';
import { PurchaseOrderForm, type PurchaseOrderFormProps } from './PurchaseOrderForm';

export interface PurchaseOrderFormModalProps extends Omit<PurchaseOrderFormProps, 'onCancel' | 'onDirtyChange'> {
  onClose: () => void;
}

/** `PurchaseOrderForm` in the shared Vertex form shell (P3E). */
export function PurchaseOrderFormModal({ onClose, ...formProps }: PurchaseOrderFormModalProps) {
  const [dirty, setDirty] = useState(false);
  return (
    <FormShell open onClose={onClose} size="lg" mode="create" isDirty={dirty}>
      <FormHeader title="New purchase order" />
      <PurchaseOrderForm {...formProps} onCancel={onClose} onDirtyChange={setDirty} />
    </FormShell>
  );
}
