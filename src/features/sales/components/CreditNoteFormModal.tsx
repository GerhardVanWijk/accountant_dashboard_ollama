import { useState } from 'react';

import { FormShell, FormHeader } from '@/components/app/form';
import { CreditNoteForm, type CreditNoteFormProps } from './CreditNoteForm';

export interface CreditNoteFormModalProps extends Omit<CreditNoteFormProps, 'onCancel' | 'onDirtyChange'> {
  onClose: () => void;
}

/** `CreditNoteForm` in the shared Vertex form shell (P3D). */
export function CreditNoteFormModal({ onClose, ...formProps }: CreditNoteFormModalProps) {
  const [dirty, setDirty] = useState(false);
  return (
    <FormShell open onClose={onClose} size="lg" mode="create" isDirty={dirty}>
      <FormHeader title="New credit note" />
      <CreditNoteForm {...formProps} onCancel={onClose} onDirtyChange={setDirty} />
    </FormShell>
  );
}
