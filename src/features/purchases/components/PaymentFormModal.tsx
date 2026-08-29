import { useState } from 'react';

import { FormShell, FormHeader } from '@/components/app/form';
import { PaymentForm, type PaymentFormProps } from './PaymentForm';

export interface PaymentFormModalProps extends Omit<PaymentFormProps, 'onCancel' | 'onDirtyChange'> {
  title?: string;
  onClose: () => void;
}

/** `PaymentForm` in the shared Vertex form shell (P3E). */
export function PaymentFormModal({ title = 'Record payment', onClose, ...formProps }: PaymentFormModalProps) {
  const [dirty, setDirty] = useState(false);
  return (
    <FormShell open onClose={onClose} size="lg" mode="create" isDirty={dirty}>
      <FormHeader title={title} />
      <PaymentForm {...formProps} onCancel={onClose} onDirtyChange={setDirty} />
    </FormShell>
  );
}
