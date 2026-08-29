import { useState } from 'react';

import { FormShell, FormHeader } from '@/components/app/form';
import { CustomerReceiptForm, type CustomerReceiptFormProps } from './CustomerReceiptForm';

export interface CustomerReceiptFormModalProps extends Omit<CustomerReceiptFormProps, 'onCancel' | 'onDirtyChange'> {
  title?: string;
  onClose: () => void;
}

/** `CustomerReceiptForm` in the shared Vertex form shell (P3D). */
export function CustomerReceiptFormModal({ title = 'Record customer receipt', onClose, ...formProps }: CustomerReceiptFormModalProps) {
  const [dirty, setDirty] = useState(false);
  return (
    <FormShell open onClose={onClose} size="lg" mode="create" isDirty={dirty}>
      <FormHeader title={title} />
      <CustomerReceiptForm {...formProps} onCancel={onClose} onDirtyChange={setDirty} />
    </FormShell>
  );
}
