import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/shadcn/dialog';
import { JournalEntryForm, type JournalEntryFormProps } from './JournalEntryForm';

export interface JournalEntryFormModalProps extends Omit<JournalEntryFormProps, 'onCancel'> {
  onClose: () => void;
}

/** Modal shell hosting JournalEntryForm, built on the shared v0 Dialog primitive. Wide, to fit the line grid. */
export function JournalEntryFormModal({ onClose, ...formProps }: JournalEntryFormModalProps) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>New journal entry</DialogTitle>
        </DialogHeader>
        <JournalEntryForm {...formProps} onCancel={onClose} />
      </DialogContent>
    </Dialog>
  );
}
