import { useState } from 'react';

import { FormShell, FormHeader } from '@/components/app/form';
import { AllocateTransactionForm, type AllocateTransactionFormProps } from './AllocateTransactionForm';

export interface AllocateTransactionFormModalProps extends Omit<AllocateTransactionFormProps, 'onCancel' | 'onDirtyChange'> {
  onClose: () => void;
}

/** `AllocateTransactionForm` in the shared Vertex form shell (P3D). */
export function AllocateTransactionFormModal({ onClose, ...formProps }: AllocateTransactionFormModalProps) {
  const [dirty, setDirty] = useState(false);
  return (
    <FormShell open onClose={onClose} size="lg" mode="edit" isDirty={dirty}>
      <FormHeader title="Allocate transaction" />
      <AllocateTransactionForm {...formProps} onCancel={onClose} onDirtyChange={setDirty} />
    </FormShell>
  );
}
