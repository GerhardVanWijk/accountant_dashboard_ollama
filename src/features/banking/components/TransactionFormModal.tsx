import { useState } from 'react';

import { FormShell, FormHeader } from '@/components/app/form';
import { TransactionForm, type TransactionFormProps } from './TransactionForm';

export interface TransactionFormModalProps extends Omit<TransactionFormProps, 'onCancel' | 'onDirtyChange'> {
  onClose: () => void;
}

/** `TransactionForm` in the shared Vertex form shell (P3D). */
export function TransactionFormModal({ onClose, ...formProps }: TransactionFormModalProps) {
  const [dirty, setDirty] = useState(false);
  return (
    <FormShell open onClose={onClose} size="lg" mode="create" isDirty={dirty}>
      <FormHeader title="New bank transaction" />
      <TransactionForm {...formProps} onCancel={onClose} onDirtyChange={setDirty} />
    </FormShell>
  );
}
