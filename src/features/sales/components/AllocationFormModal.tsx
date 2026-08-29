import { useState } from 'react';

import { FormShell, FormHeader } from '@/components/app/form';
import { AllocationForm, type AllocationFormProps, type OpenInvoiceOption } from './AllocationForm';

export type { OpenInvoiceOption };

export interface AllocationFormModalProps extends Omit<AllocationFormProps, 'onCancel' | 'onDirtyChange'> {
  title: string;
  onClose: () => void;
}

/** `AllocationForm` in the shared Vertex form shell (P3G). */
export function AllocationFormModal({ title, onClose, ...formProps }: AllocationFormModalProps) {
  const [dirty, setDirty] = useState(false);
  return (
    <FormShell open onClose={onClose} size="sm" mode="edit" isDirty={dirty}>
      <FormHeader title={title} />
      <AllocationForm {...formProps} onCancel={onClose} onDirtyChange={setDirty} />
    </FormShell>
  );
}
