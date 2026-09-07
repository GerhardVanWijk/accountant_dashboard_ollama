import { useState } from 'react';

import { FormShell, FormHeader } from '@/components/app/form';
import { TransactionForm, type TransactionFormProps } from './TransactionForm';

export interface TransactionFormModalProps extends Omit<TransactionFormProps, 'onCancel' | 'onDirtyChange'> {
  onClose: () => void;
}

/**
 * `TransactionForm` in the shared Vertex form shell (P3D).
 *
 * `height="natural"` + a mid-width cap (wider than `md`, well short of the
 * `lg` business-document width): one allocation row should read as a compact,
 * intentional dialog, not a half-empty full-height sheet. The body scrolls
 * only once enough allocation rows push it past the viewport.
 */
export function TransactionFormModal({ onClose, ...formProps }: TransactionFormModalProps) {
  const [dirty, setDirty] = useState(false);
  return (
    <FormShell
      open
      onClose={onClose}
      size="md"
      height="natural"
      mode="create"
      isDirty={dirty}
      className="sm:max-w-3xl"
    >
      <FormHeader title="New bank transaction" />
      <TransactionForm {...formProps} onCancel={onClose} onDirtyChange={setDirty} />
    </FormShell>
  );
}
