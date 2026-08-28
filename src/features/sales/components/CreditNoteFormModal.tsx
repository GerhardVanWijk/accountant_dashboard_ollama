import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/shadcn/dialog';
import { wideFormDialogClass } from '@/components/app/form-surface';
import { CreditNoteForm, type CreditNoteFormProps } from './CreditNoteForm';

export interface CreditNoteFormModalProps extends Omit<CreditNoteFormProps, 'onCancel'> {
  onClose: () => void;
}

/** Modal shell hosting CreditNoteForm, built on the shared v0 Dialog primitive. */
export function CreditNoteFormModal({ onClose, ...formProps }: CreditNoteFormModalProps) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className={wideFormDialogClass}>
        <DialogHeader>
          <DialogTitle>New credit note</DialogTitle>
        </DialogHeader>
        <CreditNoteForm {...formProps} onCancel={onClose} />
      </DialogContent>
    </Dialog>
  );
}
