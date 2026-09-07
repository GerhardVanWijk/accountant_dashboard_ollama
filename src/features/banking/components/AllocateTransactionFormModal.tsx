import { useState } from 'react';

import { FormShell, FormHeader } from '@/components/app/form';
import { AllocateTransactionForm, type AllocateTransactionFormProps } from './AllocateTransactionForm';

export interface AllocateTransactionFormModalProps extends Omit<AllocateTransactionFormProps, 'onCancel' | 'onDirtyChange'> {
  onClose: () => void;
}

/**
 * `AllocateTransactionForm` in the shared Vertex form shell (P3D). Natural
 * height + mid width, matching `TransactionFormModal` — both surfaces host
 * the same allocation editor and should feel like one workflow.
 */
export function AllocateTransactionFormModal({ onClose, ...formProps }: AllocateTransactionFormModalProps) {
  const [dirty, setDirty] = useState(false);
  return (
    <FormShell open onClose={onClose} size="md" height="natural" mode="edit" isDirty={dirty} className="sm:max-w-3xl">
      <FormHeader title="Allocate transaction" />
      <AllocateTransactionForm {...formProps} onCancel={onClose} onDirtyChange={setDirty} />
    </FormShell>
  );
}
