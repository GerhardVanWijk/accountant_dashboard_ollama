import { useState } from 'react';

import { FormShell, FormHeader } from '@/components/app/form';
import { BankAccountForm, type BankAccountFormProps } from './BankAccountForm';

export interface BankAccountFormModalProps extends Omit<BankAccountFormProps, 'onCancel' | 'onDirtyChange'> {
  title: string;
  onClose: () => void;
}

/** `BankAccountForm` in the shared Vertex form shell (P3D). */
export function BankAccountFormModal({ title, onClose, ...formProps }: BankAccountFormModalProps) {
  const [dirty, setDirty] = useState(false);
  return (
    <FormShell open onClose={onClose} size="md" mode={formProps.initialValues ? 'edit' : 'create'} isDirty={dirty}>
      <FormHeader title={title} />
      <BankAccountForm {...formProps} onCancel={onClose} onDirtyChange={setDirty} />
    </FormShell>
  );
}
