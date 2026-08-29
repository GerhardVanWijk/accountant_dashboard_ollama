import { useState } from 'react';

import { FormShell, FormHeader } from '@/components/app/form';
import { BillForm, type BillFormProps } from './BillForm';

export interface BillFormModalProps extends Omit<BillFormProps, 'onCancel' | 'onDirtyChange'> {
  onClose: () => void;
}

/** `BillForm` in the shared Vertex form shell (P3E — Purchases gains a FormModal layer). */
export function BillFormModal({ onClose, ...formProps }: BillFormModalProps) {
  const [dirty, setDirty] = useState(false);
  return (
    <FormShell open onClose={onClose} size="lg" mode="create" isDirty={dirty}>
      <FormHeader title="New bill" />
      <BillForm {...formProps} onCancel={onClose} onDirtyChange={setDirty} />
    </FormShell>
  );
}
