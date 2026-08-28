import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/shadcn/dialog';
import { wideFormDialogClass } from '@/components/app/form-surface';
import { QuoteForm, type QuoteFormProps } from './QuoteForm';

export interface QuoteFormModalProps extends Omit<QuoteFormProps, 'onCancel'> {
  title: string;
  onClose: () => void;
}

/** Modal shell hosting QuoteForm for both create and edit flows, built on the shared v0 Dialog primitive — mirrors InvoiceFormModal.tsx. */
export function QuoteFormModal({ title, onClose, ...formProps }: QuoteFormModalProps) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className={wideFormDialogClass}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <QuoteForm {...formProps} onCancel={onClose} />
      </DialogContent>
    </Dialog>
  );
}
