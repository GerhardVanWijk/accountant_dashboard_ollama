import { useState } from 'react';

import { FormShell, FormHeader } from '@/components/app/form';
import { AccountForm, type AccountFormProps } from './AccountForm';

export interface AccountFormModalProps extends Omit<AccountFormProps, 'onCancel' | 'onDirtyChange'> {
  title: string;
  onClose: () => void;
}

/** `AccountForm` in the shared Vertex form shell (P3D). */
export function AccountFormModal({ title, onClose, ...formProps }: AccountFormModalProps) {
  const [dirty, setDirty] = useState(false);
  return (
    <FormShell open onClose={onClose} size="md" mode={formProps.initialValues ? 'edit' : 'create'} isDirty={dirty}>
      <FormHeader title={title} />
      <AccountForm {...formProps} onCancel={onClose} onDirtyChange={setDirty} />
    </FormShell>
  );
}
