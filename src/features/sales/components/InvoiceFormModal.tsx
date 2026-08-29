import { useState } from 'react';

import { FormShell, FormHeader } from '@/components/app/form';
import { InvoiceForm } from './InvoiceForm';
import type { Invoice } from '@/types';

export interface InvoiceFormModalProps {
  title: string;
  invoice?: Invoice;
  customers: Map<string, string>;
  onSubmit: (data: Partial<Invoice>) => void;
  onClose: () => void;
  isLoading?: boolean;
}

/** `InvoiceForm` in the shared Vertex form shell (P3D). */
export function InvoiceFormModal({ title, onClose, ...formProps }: InvoiceFormModalProps) {
  const [dirty, setDirty] = useState(false);
  return (
    <FormShell open onClose={onClose} size="lg" mode={formProps.invoice ? 'edit' : 'create'} isDirty={dirty}>
      <FormHeader title={title} />
      <InvoiceForm {...formProps} onCancel={onClose} onDirtyChange={setDirty} />
    </FormShell>
  );
}
