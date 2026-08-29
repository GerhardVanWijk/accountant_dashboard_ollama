import { useState } from 'react';

import { FormShell, FormHeader } from '@/components/app/form';
import { CustomerForm, type CustomerFormProps } from './CustomerForm';

export interface CustomerFormModalProps extends Omit<CustomerFormProps, 'onCancel' | 'onDirtyChange'> {
  title: string;
  onClose: () => void;
}

/** `CustomerForm` in the shared Vertex form shell (P3D) — stable size across all four tabs. */
export function CustomerFormModal({ title, onClose, ...formProps }: CustomerFormModalProps) {
  const [dirty, setDirty] = useState(false);
  return (
    <FormShell open onClose={onClose} size="md" mode={formProps.mode} isDirty={dirty}>
      <FormHeader title={title} />
      <CustomerForm {...formProps} onCancel={onClose} onDirtyChange={setDirty} />
    </FormShell>
  );
}
