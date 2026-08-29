import { useState } from 'react';

import { FormShell, FormHeader } from '@/components/app/form';
import { JournalEntryForm, type JournalEntryFormProps } from './JournalEntryForm';

export interface JournalEntryFormModalProps extends Omit<JournalEntryFormProps, 'onCancel' | 'onDirtyChange'> {
  onClose: () => void;
}

/** `JournalEntryForm` in the shared Vertex form shell (P3D) — wide, for the line grid. */
export function JournalEntryFormModal({ onClose, ...formProps }: JournalEntryFormModalProps) {
  const [dirty, setDirty] = useState(false);
  return (
    <FormShell open onClose={onClose} size="lg" mode="create" isDirty={dirty}>
      <FormHeader title="New journal entry" />
      <JournalEntryForm {...formProps} onCancel={onClose} onDirtyChange={setDirty} />
    </FormShell>
  );
}
