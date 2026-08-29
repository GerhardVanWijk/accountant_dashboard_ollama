import { useState } from 'react';

import { FormShell, FormHeader } from '@/components/app/form';
import { PostAcquisitionForm, type PostAcquisitionFormProps } from './PostAcquisitionForm';

export interface PostAcquisitionFormModalProps extends Omit<PostAcquisitionFormProps, 'onCancel' | 'onDirtyChange'> {
  onClose: () => void;
}

/** `PostAcquisitionForm` in the shared Vertex form shell (P3E). */
export function PostAcquisitionFormModal({ onClose, ...formProps }: PostAcquisitionFormModalProps) {
  const [dirty, setDirty] = useState(false);
  return (
    <FormShell open onClose={onClose} size="sm" mode="edit" isDirty={dirty}>
      <FormHeader title="Post acquisition" />
      <PostAcquisitionForm {...formProps} onCancel={onClose} onDirtyChange={setDirty} />
    </FormShell>
  );
}
