import { useState } from 'react';

import { FormShell, FormHeader } from '@/components/app/form';
import { QuoteForm, type QuoteFormProps } from './QuoteForm';

export interface QuoteFormModalProps extends Omit<QuoteFormProps, 'onCancel' | 'onDirtyChange'> {
  title: string;
  onClose: () => void;
}

/** `QuoteForm` in the shared Vertex form shell (P3G) — mirrors InvoiceFormModal. */
export function QuoteFormModal({ title, onClose, ...formProps }: QuoteFormModalProps) {
  const [dirty, setDirty] = useState(false);
  return (
    <FormShell open onClose={onClose} size="lg" mode={formProps.quote ? 'edit' : 'create'} isDirty={dirty}>
      <FormHeader title={title} />
      <QuoteForm {...formProps} onCancel={onClose} onDirtyChange={setDirty} />
    </FormShell>
  );
}
